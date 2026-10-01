const truncate = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s));

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const parts = [[Math.floor(s / 86400), 'd'], [Math.floor(s / 3600) % 24, 'h'], [Math.floor(s / 60) % 60, 'm'], [s % 60, 's']];
  const out = parts.filter(([v]) => v > 0).map(([v, u]) => v + u);
  return out.length ? out.slice(0, 3).join(' ') : '0s';
}

const formatBytes = (b) => (b > 1073741824 ? (b / 1073741824).toFixed(2) + ' GB' : (b / 1048576).toFixed(1) + ' MB');
const isSnowflake = (v) => /^\d{15,25}$/.test(String(v));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function redact(text, secrets) {
  let out = String(text);
  for (const s of secrets.filter(Boolean)) out = out.split(s).join('[REDACTED]');
  return out;
}

module.exports = { truncate, formatDuration, formatBytes, isSnowflake, sleep, redact };
