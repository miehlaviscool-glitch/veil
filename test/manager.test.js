const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { makeCtx } = require('./helpers');
const { Store } = require('../src/store');

const OWNER = '111111111111111111';
const USER = '222222222222222222';
const GUILD = '333333333333333333';

test('all command modules load and serialize to valid slash-command JSON', () => {
  const { client } = makeCtx();
  assert.ok(client.commands.size >= 15, `expected >=15 commands, got ${client.commands.size}`);
  for (const c of client.commands.values()) {
    const json = c.data.toJSON();
    assert.ok(json.name && json.description, c.data.name);
    assert.ok(['public', 'manager', 'owner'].includes(c.level));
  }
});

test('permission levels', () => {
  const { manager } = makeCtx();
  assert.equal(manager.getLevel(OWNER), 'owner');
  assert.equal(manager.getLevel(USER), 'public');
  manager.addManager('t', USER);
  assert.equal(manager.getLevel(USER), 'manager');
  assert.ok(manager.hasLevel(USER, 'manager'));
  assert.ok(!manager.hasLevel(USER, 'owner'));
  assert.throws(() => manager.addManager('t', USER), /Already/);
  manager.removeManager('t', USER);
  assert.equal(manager.getLevel(USER), 'public');
});

test('blacklist users, protects owners, and leaves blacklisted guilds', async () => {
  const { manager, left } = makeCtx({ guilds: [{ id: GUILD, name: 'G', memberCount: 5 }] });
  await manager.blacklistAdd('t', 'user', USER, 'spam');
  assert.equal(manager.isBlacklisted('user', USER).reason, 'spam');
  await assert.rejects(manager.blacklistAdd('t', 'user', OWNER), /owner/);
  await assert.rejects(manager.blacklistAdd('t', 'user', 'abc'), /valid ID/);
  await manager.blacklistAdd('t', 'guild', GUILD);
  assert.deepEqual(left, [GUILD]);
  manager.blacklistRemove('t', 'user', USER);
  assert.equal(manager.isBlacklisted('user', USER), null);
  assert.throws(() => manager.blacklistRemove('t', 'user', USER), /not blacklisted/);
});

test('owner commands cannot be disabled; others can', () => {
  const { manager, store } = makeCtx();
  assert.throws(() => manager.setCommandEnabled('t', 'eval', false), /lock-out/);
  assert.throws(() => manager.setCommandEnabled('t', 'nope', false), /Unknown/);
  manager.setCommandEnabled('t', 'ping', false, 'broken');
  assert.ok(store.data.disabledCommands.ping);
  manager.setCommandEnabled('t', 'ping', true);
  assert.equal(store.data.disabledCommands.ping, undefined);
});

test('presence validation and rotation limits', () => {
  const { manager } = makeCtx();
  assert.throws(() => manager.setPresence('t', { type: 'Nope', text: 'x' }), /Type must/);
  assert.throws(() => manager.setPresence('t', { type: 'Playing', text: 'x'.repeat(200) }), /128/);
  manager.setPresence('t', { type: 'Watching', text: '{guilds} servers' });
  assert.throws(() => manager.setRotation('t', { items: [{ type: 'Bad', text: 'x' }] }), /Invalid rotation/);
  manager.setRotation('t', { enabled: false, intervalSec: 1, items: [{ type: 'Playing', text: 'hi' }] });
  assert.equal(manager.store.data.presence.rotation.intervalSec, 15); // clamped
  assert.equal(manager.renderPresenceText('{guilds}'), '0');
});

test('guild listing: search, sort, pagination', () => {
  const guilds = Array.from({ length: 30 }, (_, i) => ({ id: '1000000000000000' + String(i).padStart(2, '0'), name: `Guild ${i}`, memberCount: i }));
  const { manager } = makeCtx({ guilds });
  const r = manager.listGuilds({ perPage: 25 });
  assert.equal(r.total, 30);
  assert.equal(r.pages, 2);
  assert.equal(r.guilds[0].memberCount, 29);
  assert.equal(manager.listGuilds({ q: 'guild 7' }).total, 1);
});

test('audit log is capped and persisted; store backup/restore round-trips', () => {
  const { manager, store, dir } = makeCtx();
  for (let i = 0; i < 520; i++) manager.audit('t', 'x', String(i));
  assert.equal(store.data.audit.length, 500);
  manager.setMaintenance('t', true, 'upgrade');
  const name = manager.backup('t');
  manager.setMaintenance('t', false);
  manager.restoreBackup('t', name);
  assert.equal(store.data.maintenance.enabled, true);
  assert.throws(() => store.restore('../../etc/passwd'), /Invalid backup/);
  store.flush();
  const reloaded = new Store(`${dir}/data.json`);
  assert.equal(reloaded.data.maintenance.reason, 'upgrade');
});

test('corrupt data file is preserved, not overwritten', () => {
  const { dir } = makeCtx();
  fs.writeFileSync(`${dir}/data.json`, '{not json');
  new Store(`${dir}/data.json`);
  assert.ok(fs.readdirSync(dir).some((f) => f.includes('.corrupt-')));
});

test('broadcast dry run counts without sending', async () => {
  const { manager } = makeCtx({ guilds: [{ id: GUILD, name: 'G', memberCount: 1, members: { me: {} }, channels: { cache: new (require('discord.js').Collection)() }, systemChannel: null }] });
  const job = manager.startBroadcast('t', { message: 'hello', dryRun: true });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(job.status, 'finished');
  assert.equal(job.skipped, 1);
  assert.throws(() => manager.startBroadcast('t', { message: '' }), /1-1900/);
});

test('schedules: validation, interval/one-shot ticking, run now', async () => {
  const { manager, store, client } = makeCtx();
  const sent = [];
  client.channels.fetch = async () => ({ isTextBased: () => true, send: async (m) => sent.push(m.content) });
  assert.throws(() => manager.addSchedule('t', { message: '', broadcast: true }), /1-1900/);
  assert.throws(() => manager.addSchedule('t', { message: 'x', channelId: 'bad' }), /channel ID/);
  assert.throws(() => manager.addSchedule('t', { message: 'x', broadcast: true, everySec: 5 }), /1 minute/);
  assert.throws(() => manager.addSchedule('t', { message: 'x', broadcast: true, at: Date.now() - 999999 }), /future/);

  const once = manager.addSchedule('t', { name: 'once', message: 'hello', channelId: '555555555555555555', at: Date.now() + 5 });
  const rep = manager.addSchedule('t', { name: 'rep', message: 'again', channelId: '555555555555555555', everySec: 60, at: Date.now() + 5 });
  await new Promise((r) => setTimeout(r, 20));
  await manager.tickSchedules();
  assert.deepEqual(sent.sort(), ['again', 'hello']);
  assert.equal(once.enabled, false);          // one-shot disables itself
  assert.equal(once.nextRun, null);
  assert.ok(rep.enabled && rep.nextRun > Date.now() + 50_000); // repeating re-arms
  await manager.tickSchedules();
  assert.equal(sent.length, 2);                // nothing due, nothing re-sent
  await manager.runScheduleNow('t', once.id);
  assert.equal(sent.length, 3);
  manager.toggleSchedule('t', once.id);
  assert.equal(once.enabled, true);
  manager.removeSchedule('t', once.id);
  assert.equal(store.data.schedules.length, 1);
});

test('activity feed is capped; guild notes; invite url', async () => {
  const { manager, store } = makeCtx({ guilds: [{ id: GUILD, name: 'G', memberCount: 5, roles: { cache: { size: 2 } }, channels: { cache: { size: 3 } }, fetchOwner: async () => ({ user: { tag: 'o#1' } }), features: [] }] });
  for (let i = 0; i < 230; i++) manager.activity('join', `g${i}`);
  assert.equal(store.data.activity.length, 200);
  manager.setGuildNote('t', GUILD, 'trusted partner');
  assert.equal((await manager.guildDetail(GUILD)).note, 'trusted partner');
  manager.setGuildNote('t', GUILD, '');
  assert.equal(store.data.guildNotes[GUILD], undefined);
  const url = new URL(manager.inviteUrl('moderator'));
  assert.equal(url.searchParams.get('client_id'), '999999999999999999');
  assert.ok(BigInt(url.searchParams.get('permissions')) > 0n);
  assert.equal(new URL(manager.inviteUrl('admin')).searchParams.get('permissions'), '8');
  assert.throws(() => manager.inviteUrl('nope'), /Unknown preset/);
});
