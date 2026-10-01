const fs = require('fs');
const path = require('path');

const DEFAULTS = () => ({
  blacklist: { users: {}, guilds: {} },
  disabledCommands: {},
  managers: [],
  maintenance: { enabled: false, reason: '' },
  presence: {
    current: { type: 'Playing', text: '', status: 'online' },
    rotation: { enabled: false, intervalSec: 60, items: [] },
  },
  stats: { commandUsage: {}, commandErrors: {}, daily: {}, guildUsage: {} },
  schedules: [],
  activity: [],
  guildNotes: {},
  audit: [],
  deployHash: null,
});

function merge(base, extra) {
  if (Array.isArray(base) || typeof base !== 'object' || base === null) return extra === undefined ? base : extra;
  const out = { ...base };
  for (const k of Object.keys(extra || {})) out[k] = k in base ? merge(base[k], extra[k]) : extra[k];
  return out;
}

/** Tiny durable JSON store: debounced, atomic (tmp + rename) writes, timestamped backups. */
class Store {
  constructor(file) {
    this.file = file;
    this.backupDir = path.join(path.dirname(file), 'backups');
    fs.mkdirSync(this.backupDir, { recursive: true });
    this.data = DEFAULTS();
    try {
      this.data = merge(DEFAULTS(), JSON.parse(fs.readFileSync(file, 'utf8')));
    } catch (e) {
      // Corrupt file: keep it for inspection rather than silently overwriting it.
      if (e.code !== 'ENOENT') fs.copyFileSync(file, `${file}.corrupt-${Date.now()}`);
    }
    this.timer = null;
  }

  save() {
    if (this.timer) return;
    this.timer = setTimeout(() => this.flush(), 400);
    this.timer.unref?.();
  }

  flush() {
    clearTimeout(this.timer);
    this.timer = null;
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }

  update(fn) {
    const result = fn(this.data);
    this.save();
    return result;
  }

  backup(keep = 20) {
    this.flush();
    const name = `data-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    fs.copyFileSync(this.file, path.join(this.backupDir, name));
    for (const old of this.listBackups().slice(keep)) fs.unlinkSync(path.join(this.backupDir, old.name));
    return name;
  }

  listBackups() {
    return fs
      .readdirSync(this.backupDir)
      .filter((f) => f.endsWith('.json'))
      .map((name) => ({ name, size: fs.statSync(path.join(this.backupDir, name)).size }))
      .sort((a, b) => b.name.localeCompare(a.name));
  }

  restore(name) {
    if (!/^data-[\w.-]+\.json$/.test(name)) throw new Error('Invalid backup name.');
    const parsed = JSON.parse(fs.readFileSync(path.join(this.backupDir, name), 'utf8'));
    this.data = merge(DEFAULTS(), parsed);
    this.flush();
  }

  /** Per-day counters, trimmed to 30 days. */
  bump(field, n = 1) {
    const day = new Date().toISOString().slice(0, 10);
    const daily = this.data.stats.daily;
    daily[day] = daily[day] || { commands: 0, errors: 0, joins: 0, leaves: 0 };
    daily[day][field] = (daily[day][field] || 0) + n;
    for (const d of Object.keys(daily).sort().slice(0, -30)) delete daily[d];
    this.save();
  }
}

module.exports = { Store, DEFAULTS };
