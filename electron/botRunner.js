const { fork } = require('child_process');
const { EventEmitter } = require('events');

const RESTART_CODE = 42;

/**
 * Runs the bot as a child process (Electron's own Node runtime), supervising it:
 * restarts on crash with backoff, on the /restart exit code, and stops retrying on fatal
 * errors such as an invalid token.
 */
class BotRunner extends EventEmitter {
  constructor({ entry, cwd, getEnv }) {
    super();
    Object.assign(this, { entry, cwd, getEnv });
    this.child = null;
    this.wantRunning = false;
    this.state = { status: 'stopped', tag: null, reason: null, restarts: 0, startedAt: null, guilds: null };
    this.crashes = 0;
    this.retryTimer = null;
    this.output = [];
  }

  set(patch) {
    this.state = { ...this.state, ...patch };
    this.emit('status', this.state);
  }

  start() {
    this.wantRunning = true;
    clearTimeout(this.retryTimer);
    if (this.child) return;
    this.set({ status: 'starting', reason: null, tag: null });
    this.output = [];
    const began = Date.now();
    let fatal = null;

    const child = fork(this.entry, [], {
      cwd: this.cwd,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', ...this.getEnv() },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      windowsHide: true,
    });
    this.child = child;
    this.set({ startedAt: began });

    const keep = (d) => { this.output.push(...String(d).split(/\r?\n/).filter(Boolean)); this.output = this.output.slice(-60); };
    child.stdout.on('data', keep);
    child.stderr.on('data', keep);

    child.on('message', (m) => {
      if (m?.type === 'ready') { this.crashes = 0; this.set({ status: 'online', tag: m.tag, guilds: m.guilds }); }
      else if (m?.type === 'fatal') fatal = m.reason;
      else if (m?.type === 'notify') this.emit('notify', m);
    });

    child.on('exit', (code) => {
      this.child = null;
      if (!this.wantRunning) return this.set({ status: 'stopped', tag: null });
      if (fatal) { this.wantRunning = false; return this.set({ status: 'error', reason: fatal, tag: null }); }
      if (code === RESTART_CODE) { this.set({ restarts: this.state.restarts + 1 }); return this.start(); }
      if (code === 0) { this.wantRunning = false; return this.set({ status: 'stopped', tag: null }); }
      this.crashes = Date.now() - began > 60_000 ? 1 : this.crashes + 1;
      const delay = Math.min(30_000, 1000 * 2 ** Math.min(this.crashes, 5));
      const last = this.output.filter((l) => /error/i.test(l)).slice(-1)[0] || `exit code ${code}`;
      this.set({ status: 'crashed', reason: `${last} — retrying in ${delay / 1000}s`, tag: null, restarts: this.state.restarts + 1 });
      this.retryTimer = setTimeout(() => this.wantRunning && this.start(), delay);
    });
  }

  /** Graceful stop: asks the bot to flush and exit, force-kills after 4s. */
  stop() {
    this.wantRunning = false;
    clearTimeout(this.retryTimer);
    const child = this.child;
    if (!child) return Promise.resolve(this.set({ status: 'stopped', tag: null }));
    return new Promise((resolve) => {
      const kill = setTimeout(() => child.kill(), 4000);
      child.once('exit', () => { clearTimeout(kill); resolve(); });
      try { child.send({ type: 'shutdown' }); } catch { child.kill(); }
    });
  }

  async restart() {
    await this.stop();
    this.set({ restarts: this.state.restarts });
    this.start();
  }
}

module.exports = { BotRunner };
