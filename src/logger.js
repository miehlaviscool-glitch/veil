const fs = require('fs');
const path = require('path');
const util = require('util');
const { EventEmitter } = require('events');

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

/** Console + daily file logger that also keeps a ring buffer for the dashboard and /logs. */
class Logger extends EventEmitter {
  constructor({ dir, level = 'info', max = 1000 } = {}) {
    super();
    this.dir = dir;
    this.min = LEVELS[level] ?? LEVELS.info;
    this.max = max;
    this.buffer = [];
    this.seq = 0;
    if (dir) fs.mkdirSync(dir, { recursive: true });
  }

  write(level, args) {
    if (LEVELS[level] < this.min) return;
    const msg = args
      .map((a) => (a instanceof Error ? a.stack || a.message : typeof a === 'string' ? a : util.inspect(a, { depth: 3 })))
      .join(' ');
    const entry = { id: ++this.seq, ts: Date.now(), level, msg };
    this.buffer.push(entry);
    if (this.buffer.length > this.max) this.buffer.shift();
    const line = `${new Date(entry.ts).toISOString()} [${level.toUpperCase()}] ${msg}`;
    (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(line);
    if (this.dir) {
      const file = path.join(this.dir, `bot-${new Date().toISOString().slice(0, 10)}.log`);
      fs.appendFile(file, line + '\n', () => {});
    }
    this.emit('entry', entry);
  }

  debug(...a) { this.write('debug', a); }
  info(...a) { this.write('info', a); }
  warn(...a) { this.write('warn', a); }
  error(...a) { this.write('error', a); }

  /** Entries newer than `since` (id), optionally filtered by minimum level. */
  tail({ limit = 50, level, since = 0 } = {}) {
    const min = level ? LEVELS[level] ?? 0 : 0;
    return this.buffer.filter((e) => e.id > since && LEVELS[e.level] >= min).slice(-limit);
  }
}

module.exports = { Logger, LEVELS };
