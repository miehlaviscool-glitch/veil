const { ActivityType, PermissionsBitField, ChannelType } = require('discord.js');
const { isSnowflake, sleep, formatDuration } = require('../util');

const LEVEL_RANK = { public: 0, manager: 1, owner: 2 };
const ACTIVITY_TYPES = { Playing: ActivityType.Playing, Watching: ActivityType.Watching, Listening: ActivityType.Listening, Competing: ActivityType.Competing, Custom: ActivityType.Custom };
const STATUSES = ['online', 'idle', 'dnd', 'invisible'];

/**
 * Every management action lives here so slash commands and the web dashboard share
 * identical behaviour, validation and audit trail. `actor` is a string such as
 * "discord:1234" or "dashboard".
 */
class Manager {
  constructor({ client, store, logger, config, notifier, loadCommands }) {
    Object.assign(this, { client, store, logger, config, notifier, loadCommands });
    this.appOwnerIds = new Set();
    this.jobs = new Map();
    this.rotationTimer = null;
    this.rotationIndex = 0;
  }

  // ---------- permissions ----------
  async resolveAppOwners() {
    try {
      const app = await this.client.application.fetch();
      const owner = app.owner;
      if (owner?.members) for (const m of owner.members.values()) this.appOwnerIds.add(m.user.id);
      else if (owner?.id) this.appOwnerIds.add(owner.id);
    } catch (e) {
      this.logger.warn('Could not resolve application owner:', e.message);
    }
  }

  isEnvOwner(id) { return this.config.ownerIds.includes(id); }
  getLevel(id) {
    if (this.isEnvOwner(id) || this.appOwnerIds.has(id)) return 'owner';
    if (this.store.data.managers.includes(id)) return 'manager';
    return 'public';
  }
  hasLevel(id, level) { return LEVEL_RANK[this.getLevel(id)] >= LEVEL_RANK[level]; }

  // ---------- audit ----------
  audit(actor, action, details = '') {
    const entry = { ts: Date.now(), actor, action, details: String(details).slice(0, 500) };
    this.store.update((d) => {
      d.audit.push(entry);
      if (d.audit.length > 500) d.audit.splice(0, d.audit.length - 500);
    });
    this.logger.info(`[audit] ${actor} ${action} ${entry.details}`);
    if (/^(blacklist|maintenance|guild.leave|bot.|broadcast.start)/.test(action)) this.activity('admin', `${action} ${entry.details}`.slice(0, 200));
    this.notifier.send(`Audit: ${action}`, `**Actor:** ${actor}\n${entry.details}`, 0xfee75c);
    return entry;
  }

  // ---------- stats ----------
  stats() {
    const c = this.client;
    const mem = process.memoryUsage();
    const guilds = [...c.guilds.cache.values()];
    return {
      tag: c.user?.tag ?? null,
      id: c.user?.id ?? null,
      avatar: c.user?.displayAvatarURL?.() ?? null,
      uptimeMs: c.uptime ?? 0,
      uptime: formatDuration(c.uptime ?? 0),
      ping: c.ws?.ping ?? -1,
      guilds: guilds.length,
      users: guilds.reduce((n, g) => n + (g.memberCount || 0), 0),
      channels: c.channels?.cache?.size ?? 0,
      memory: { rss: mem.rss, heapUsed: mem.heapUsed },
      node: process.version,
      commands: c.commands?.size ?? 0,
      maintenance: this.store.data.maintenance,
      blacklist: { users: Object.keys(this.store.data.blacklist.users).length, guilds: Object.keys(this.store.data.blacklist.guilds).length },
      usage: this.store.data.stats.commandUsage,
      errors: this.store.data.stats.commandErrors,
      daily: this.store.data.stats.daily,
      topGuilds: Object.entries(this.store.data.stats.guildUsage)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([id, uses]) => ({ id, uses, name: c.guilds.cache.get(id)?.name ?? id })),
      schedules: this.store.data.schedules.filter((s) => s.enabled).length,
    };
  }

  // ---------- activity feed ----------
  activity(type, text) {
    this.store.update((d) => {
      d.activity.push({ ts: Date.now(), type, text: String(text).slice(0, 300) });
      if (d.activity.length > 200) d.activity.splice(0, d.activity.length - 200);
    });
  }

  // ---------- guild detail & notes ----------
  async guildDetail(id) {
    const g = this.client.guilds.cache.get(id);
    if (!g) throw new Error('The bot is not in that guild.');
    const owner = await g.fetchOwner().then((m) => m.user.tag).catch(() => null);
    return {
      ...this.serializeGuild(g),
      ownerTag: owner,
      createdAt: g.createdTimestamp,
      channels: g.channels?.cache?.size ?? 0,
      roles: g.roles?.cache?.size ?? 0,
      boostTier: g.premiumTier ?? 0,
      features: (g.features || []).slice(0, 12),
      commandsUsed: this.store.data.stats.guildUsage[id] || 0,
      note: this.store.data.guildNotes[id] || '',
    };
  }

  setGuildNote(actor, id, note) {
    if (!isSnowflake(id)) throw new Error('Invalid ID.');
    const text = String(note || '').slice(0, 500);
    this.store.update((d) => { if (text) d.guildNotes[id] = text; else delete d.guildNotes[id]; });
    this.audit(actor, 'guild.note', `${id}: ${text.slice(0, 80)}`);
  }

  // ---------- invite builder ----------
  invitePresets() {
    const F = PermissionsBitField.Flags;
    return {
      minimal: { label: 'Minimal (read & send messages)', perms: [F.ViewChannel, F.SendMessages, F.EmbedLinks, F.ReadMessageHistory] },
      moderator: { label: 'Moderator', perms: [F.ViewChannel, F.SendMessages, F.EmbedLinks, F.ReadMessageHistory, F.ManageMessages, F.KickMembers, F.BanMembers, F.ModerateMembers, F.ManageRoles] },
      admin: { label: 'Administrator (full access)', perms: [F.Administrator] },
    };
  }

  inviteUrl(preset = 'minimal') {
    const p = this.invitePresets()[preset];
    if (!p) throw new Error('Unknown preset.');
    if (!this.client.user?.id) throw new Error('Bot is not ready yet.');
    const permissions = new PermissionsBitField(p.perms).bitfield.toString();
    const params = new URLSearchParams({ client_id: this.client.user.id, permissions, scope: 'bot applications.commands' });
    return `https://discord.com/oauth2/authorize?${params}`;
  }

  // ---------- scheduled messages ----------
  addSchedule(actor, { name, message, channelId, broadcast = false, at, everySec }) {
    const list = this.store.data.schedules;
    if (list.length >= 50) throw new Error('At most 50 schedules.');
    if (!message || String(message).length > 1900) throw new Error('Message must be 1-1900 characters.');
    if (!broadcast && !isSnowflake(channelId)) throw new Error('A valid channel ID is required (or enable broadcast).');
    const interval = everySec ? Number(everySec) : 0;
    if (interval && (interval < 60 || interval > 2592000)) throw new Error('Repeat interval must be between 1 minute and 30 days.');
    const first = at ? Number(at) : Date.now() + (interval ? interval * 1000 : 0);
    if (!Number.isFinite(first) || first < Date.now() - 1000) throw new Error('The scheduled time must be in the future.');
    const s = {
      id: Math.random().toString(36).slice(2, 8),
      name: String(name || 'Untitled').slice(0, 60),
      message: String(message),
      target: broadcast ? { type: 'broadcast' } : { type: 'channel', channelId },
      everySec: interval || null,
      nextRun: first,
      enabled: true,
      runs: 0,
      lastRun: null,
      lastResult: null,
    };
    this.store.update((d) => d.schedules.push(s));
    this.audit(actor, 'schedule.add', `${s.id} ${s.name}`);
    return s;
  }

  removeSchedule(actor, id) {
    if (!this.store.data.schedules.some((s) => s.id === id)) throw new Error('No such schedule.');
    this.store.update((d) => { d.schedules = d.schedules.filter((s) => s.id !== id); });
    this.audit(actor, 'schedule.remove', id);
  }

  toggleSchedule(actor, id) {
    const s = this.store.data.schedules.find((x) => x.id === id);
    if (!s) throw new Error('No such schedule.');
    this.store.update(() => {
      s.enabled = !s.enabled;
      if (s.enabled && (!s.nextRun || s.nextRun < Date.now())) s.nextRun = Date.now() + (s.everySec ? s.everySec * 1000 : 60_000);
    });
    this.audit(actor, s.enabled ? 'schedule.enable' : 'schedule.disable', id);
  }

  async runSchedule(s, actor = 'scheduler') {
    let result;
    try {
      if (s.target.type === 'broadcast') {
        const job = this.startBroadcast(actor, { message: s.message, target: 'channels' });
        result = `broadcast ${job.id} started`;
      } else {
        const ch = await this.client.channels.fetch(s.target.channelId);
        if (!ch?.isTextBased?.()) throw new Error('not a text channel');
        await ch.send({ content: s.message, allowedMentions: { parse: [] } });
        result = 'sent';
      }
    } catch (e) {
      result = `failed: ${e.message}`.slice(0, 120);
      this.logger.warn(`Schedule ${s.id} failed: ${e.message}`);
    }
    this.store.update(() => { s.runs++; s.lastRun = Date.now(); s.lastResult = result; });
    return result;
  }

  async runScheduleNow(actor, id) {
    const s = this.store.data.schedules.find((x) => x.id === id);
    if (!s) throw new Error('No such schedule.');
    this.audit(actor, 'schedule.run', id);
    return this.runSchedule(s, actor);
  }

  async tickSchedules() {
    const now = Date.now();
    for (const s of this.store.data.schedules) {
      if (!s.enabled || !s.nextRun || s.nextRun > now) continue;
      this.store.update(() => {
        if (s.everySec) s.nextRun = now + s.everySec * 1000;
        else { s.nextRun = null; s.enabled = false; } // one-shot
      });
      await this.runSchedule(s);
    }
  }

  startSchedules() {
    clearInterval(this.scheduleTimer);
    this.scheduleTimer = setInterval(() => this.tickSchedules().catch((e) => this.logger.error('Schedule tick failed:', e)), 15_000);
    this.scheduleTimer.unref?.();
  }

  // ---------- guilds ----------
  serializeGuild(g) {
    return {
      id: g.id,
      name: g.name,
      memberCount: g.memberCount,
      ownerId: g.ownerId,
      joinedAt: g.joinedTimestamp,
      icon: g.iconURL?.({ size: 64 }) ?? null,
      blacklisted: !!this.store.data.blacklist.guilds[g.id],
    };
  }

  listGuilds({ q = '', sort = 'members', page = 1, perPage = 25 } = {}) {
    let list = [...this.client.guilds.cache.values()];
    const needle = q.trim().toLowerCase();
    if (needle) list = list.filter((g) => g.name.toLowerCase().includes(needle) || g.id.includes(needle));
    const sorters = {
      members: (a, b) => b.memberCount - a.memberCount,
      name: (a, b) => a.name.localeCompare(b.name),
      newest: (a, b) => b.joinedTimestamp - a.joinedTimestamp,
      oldest: (a, b) => a.joinedTimestamp - b.joinedTimestamp,
    };
    list.sort(sorters[sort] || sorters.members);
    const total = list.length;
    const pages = Math.max(1, Math.ceil(total / perPage));
    const p = Math.min(Math.max(1, page), pages);
    return { total, page: p, pages, guilds: list.slice((p - 1) * perPage, p * perPage).map((g) => this.serializeGuild(g)) };
  }

  async leaveGuild(actor, guildId, reason = '') {
    const g = this.client.guilds.cache.get(guildId);
    if (!g) throw new Error('The bot is not in that guild.');
    const name = g.name;
    await g.leave();
    this.audit(actor, 'guild.leave', `${name} (${guildId}) ${reason}`.trim());
    return name;
  }

  // ---------- blacklist ----------
  async blacklistAdd(actor, kind, id, reason = 'No reason provided') {
    if (!['user', 'guild'].includes(kind)) throw new Error('Type must be "user" or "guild".');
    if (!isSnowflake(id)) throw new Error('That is not a valid ID.');
    if (kind === 'user' && (this.getLevel(id) !== 'public' || id === this.client.user?.id)) throw new Error('You cannot blacklist an owner, manager or the bot itself.');
    this.store.update((d) => {
      d.blacklist[kind + 's'][id] = { reason: String(reason).slice(0, 200), by: actor, at: Date.now() };
    });
    this.audit(actor, `blacklist.${kind}.add`, `${id}: ${reason}`);
    if (kind === 'guild' && this.client.guilds.cache.has(id)) await this.client.guilds.cache.get(id).leave().catch((e) => this.logger.warn('Leave failed:', e.message));
  }

  blacklistRemove(actor, kind, id) {
    if (!['user', 'guild'].includes(kind)) throw new Error('Type must be "user" or "guild".');
    const bucket = this.store.data.blacklist[kind + 's'];
    if (!bucket[id]) throw new Error('That ID is not blacklisted.');
    this.store.update(() => delete bucket[id]);
    this.audit(actor, `blacklist.${kind}.remove`, id);
  }

  isBlacklisted(kind, id) { return this.store.data.blacklist[kind + 's'][id] || null; }

  // ---------- commands ----------
  setCommandEnabled(actor, name, enabled, reason = '') {
    const cmd = this.client.commands.get(name);
    if (!cmd) throw new Error(`Unknown command "${name}".`);
    if (cmd.level === 'owner') throw new Error('Owner commands cannot be disabled (prevents lock-out).');
    this.store.update((d) => {
      if (enabled) delete d.disabledCommands[name];
      else d.disabledCommands[name] = { reason: String(reason).slice(0, 200), by: actor, at: Date.now() };
    });
    this.audit(actor, enabled ? 'command.enable' : 'command.disable', `${name} ${reason}`.trim());
  }

  async reloadCommands(actor) {
    const count = this.loadCommands(this.client);
    this.audit(actor, 'commands.reload', `${count} commands`);
    return count;
  }

  listCommands() {
    return [...this.client.commands.values()].map((c) => ({
      name: c.data.name,
      description: c.data.description,
      level: c.level || 'public',
      cooldown: c.cooldown || 0,
      disabled: this.store.data.disabledCommands[c.data.name] || null,
      uses: this.store.data.stats.commandUsage[c.data.name] || 0,
      errors: this.store.data.stats.commandErrors[c.data.name] || 0,
    }));
  }

  // ---------- maintenance ----------
  setMaintenance(actor, enabled, reason = '') {
    this.store.update((d) => { d.maintenance = { enabled: !!enabled, reason: String(reason).slice(0, 300) }; });
    this.audit(actor, enabled ? 'maintenance.on' : 'maintenance.off', reason);
  }

  // ---------- managers ----------
  addManager(actor, id) {
    if (!isSnowflake(id)) throw new Error('That is not a valid user ID.');
    if (this.store.data.managers.includes(id)) throw new Error('Already a manager.');
    this.store.update((d) => d.managers.push(id));
    this.audit(actor, 'manager.add', id);
  }
  removeManager(actor, id) {
    if (!this.store.data.managers.includes(id)) throw new Error('Not a manager.');
    this.store.update((d) => { d.managers = d.managers.filter((m) => m !== id); });
    this.audit(actor, 'manager.remove', id);
  }

  // ---------- presence ----------
  renderPresenceText(text) {
    const s = this.stats();
    return String(text)
      .replaceAll('{guilds}', s.guilds.toLocaleString())
      .replaceAll('{users}', s.users.toLocaleString())
      .replaceAll('{uptime}', s.uptime)
      .replaceAll('{ping}', s.ping)
      .replaceAll('{commands}', s.commands);
  }

  applyPresence(p = this.store.data.presence.current) {
    if (!this.client.user) return;
    const activities = p.text
      ? [p.type === 'Custom' ? { name: 'Custom Status', type: ActivityType.Custom, state: this.renderPresenceText(p.text) } : { name: this.renderPresenceText(p.text), type: ACTIVITY_TYPES[p.type] ?? ActivityType.Playing }]
      : [];
    this.client.user.setPresence({ status: p.status || 'online', activities });
  }

  setPresence(actor, { type = 'Playing', text = '', status = 'online' }) {
    if (!(type in ACTIVITY_TYPES)) throw new Error(`Type must be one of: ${Object.keys(ACTIVITY_TYPES).join(', ')}`);
    if (!STATUSES.includes(status)) throw new Error(`Status must be one of: ${STATUSES.join(', ')}`);
    if (String(text).length > 128) throw new Error('Text must be 128 characters or fewer.');
    const p = { type, text: String(text), status };
    this.store.update((d) => { d.presence.current = p; });
    this.applyPresence(p);
    this.audit(actor, 'presence.set', `${status} ${type} ${text}`);
  }

  setRotation(actor, { enabled, intervalSec, items }) {
    const r = this.store.data.presence.rotation;
    const next = {
      enabled: enabled ?? r.enabled,
      intervalSec: Math.min(3600, Math.max(15, Number(intervalSec ?? r.intervalSec) || 60)),
      items: items ?? r.items,
    };
    for (const it of next.items) {
      if (!(it.type in ACTIVITY_TYPES) || !it.text || it.text.length > 128) throw new Error('Invalid rotation item.');
    }
    if (next.items.length > 25) throw new Error('At most 25 rotation items.');
    this.store.update((d) => { d.presence.rotation = next; });
    this.startRotation();
    this.audit(actor, 'presence.rotation', `enabled=${next.enabled} every ${next.intervalSec}s, ${next.items.length} items`);
  }

  startRotation() {
    clearInterval(this.rotationTimer);
    this.rotationTimer = null;
    const r = this.store.data.presence.rotation;
    if (!r.enabled || !r.items.length) return this.applyPresence();
    const tick = () => {
      const items = this.store.data.presence.rotation.items;
      if (!items.length) return;
      const it = items[this.rotationIndex++ % items.length];
      this.applyPresence({ ...it, status: this.store.data.presence.current.status });
    };
    tick();
    this.rotationTimer = setInterval(tick, r.intervalSec * 1000);
    this.rotationTimer.unref?.();
  }

  // ---------- broadcast ----------
  broadcastTarget(guild) {
    const me = guild.members.me;
    const ok = (ch) => ch && ch.type === ChannelType.GuildText && ch.permissionsFor(me)?.has([PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]);
    if (ok(guild.systemChannel)) return guild.systemChannel;
    return guild.channels.cache.find(ok) || null;
  }

  /** Starts a background job and returns its id. dryRun only counts reachable targets. */
  startBroadcast(actor, { message, target = 'channels', dryRun = false }) {
    if (!message || message.length > 1900) throw new Error('Message must be 1-1900 characters.');
    if (!['channels', 'owners'].includes(target)) throw new Error('Target must be "channels" or "owners".');
    const id = Math.random().toString(36).slice(2, 10);
    const job = { id, type: 'broadcast', dryRun, target, status: 'running', total: this.client.guilds.cache.size, done: 0, sent: 0, failed: 0, skipped: 0, startedAt: Date.now() };
    this.jobs.set(id, job);
    if (this.jobs.size > 20) this.jobs.delete(this.jobs.keys().next().value);
    this.audit(actor, dryRun ? 'broadcast.dryrun' : 'broadcast.start', `${target}: ${message.slice(0, 100)}`);
    (async () => {
      for (const guild of this.client.guilds.cache.values()) {
        try {
          const dest = target === 'owners' ? await guild.fetchOwner().then((m) => m.user) : this.broadcastTarget(guild);
          if (!dest) job.skipped++;
          else if (dryRun) job.sent++;
          else { await dest.send({ content: message, allowedMentions: { parse: [] } }); job.sent++; await sleep(1100); }
        } catch (e) {
          job.failed++;
          this.logger.debug(`Broadcast to ${guild.id} failed: ${e.message}`);
        }
        job.done++;
      }
      job.status = 'finished';
      job.finishedAt = Date.now();
      this.logger.info(`Broadcast ${id} finished: sent=${job.sent} failed=${job.failed} skipped=${job.skipped}`);
    })();
    return job;
  }

  // ---------- data ----------
  backup(actor) {
    const name = this.store.backup();
    this.audit(actor, 'backup.create', name);
    return name;
  }
  restoreBackup(actor, name) {
    this.store.restore(name);
    this.startRotation();
    this.audit(actor, 'backup.restore', name);
  }

  // ---------- lifecycle ----------
  restart(actor) {
    this.audit(actor, 'bot.restart');
    this.store.flush();
    setTimeout(() => process.exit(this.config.restartExitCode), 750);
  }
  shutdown(actor) {
    this.audit(actor, 'bot.shutdown');
    this.store.flush();
    setTimeout(() => process.exit(0), 750);
  }
}

module.exports = { Manager, LEVEL_RANK, ACTIVITY_TYPES, STATUSES };
