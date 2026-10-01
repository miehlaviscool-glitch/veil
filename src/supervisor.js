/**
 * Keeps the bot alive: restarts on crash (with backoff) and on the /restart exit code.
 * A clean exit (code 0, e.g. /shutdown or Ctrl+C) stops the supervisor.
 */
const { spawn } = require('child_process');
const path = require('path');

const RESTART_CODE = 42;
let crashes = 0;
let lastStart = 0;
let child = null;

function start() {
  lastStart = Date.now();
  child = spawn(process.execPath, [path.join(__dirname, 'index.js')], { stdio: 'inherit' });
  child.on('exit', (code, signal) => {
    if (code === 0 || signal === 'SIGINT' || signal === 'SIGTERM') process.exit(0);
    if (code === RESTART_CODE) { crashes = 0; console.log('[supervisor] Restart requested.'); return setTimeout(start, 500); }
    crashes = Date.now() - lastStart > 60_000 ? 1 : crashes + 1; // stable for a minute = reset
    const delay = Math.min(30_000, 1000 * 2 ** Math.min(crashes, 5));
    console.error(`[supervisor] Bot exited (code ${code}). Restarting in ${delay / 1000}s (crash #${crashes}).`);
    setTimeout(start, delay);
  });
}

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child?.kill(sig));
start();
