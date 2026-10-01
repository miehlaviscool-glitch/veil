require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const bool = (v, d = false) => (v === undefined || v === '' ? d : /^(1|true|yes|on)$/i.test(v));
const list = (v) => (v || '').split(',').map((s) => s.trim()).filter(Boolean);

const root = path.resolve(__dirname, '..');
const dataDir = path.resolve(root, process.env.DATA_DIR || 'data');
fs.mkdirSync(dataDir, { recursive: true });

// Persist an auto-generated dashboard token so it survives restarts.
function resolveDashboardToken() {
  if (process.env.DASHBOARD_TOKEN) return { token: process.env.DASHBOARD_TOKEN, generated: false };
  const file = path.join(dataDir, '.dashboard-token');
  try {
    const existing = fs.readFileSync(file, 'utf8').trim();
    if (existing) return { token: existing, generated: false, file };
  } catch {}
  const token = crypto.randomBytes(24).toString('base64url');
  fs.writeFileSync(file, token, { mode: 0o600 });
  return { token, generated: true, file };
}

const dash = resolveDashboardToken();

module.exports = {
  root,
  dataDir,
  logDir: path.resolve(root, process.env.LOG_DIR || 'logs'),
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  ownerIds: list(process.env.OWNER_IDS),
  devGuildId: process.env.DEV_GUILD_ID || null,
  autoDeploy: bool(process.env.AUTO_DEPLOY, true),
  enableEval: bool(process.env.ENABLE_EVAL, false),
  webhookUrl: process.env.LOG_WEBHOOK_URL || null,
  logLevel: process.env.LOG_LEVEL || 'info',
  restartExitCode: 42,
  dashboard: {
    enabled: bool(process.env.DASHBOARD_ENABLED, true),
    host: process.env.DASHBOARD_HOST || '127.0.0.1',
    port: Number(process.env.DASHBOARD_PORT) || 3000,
    token: dash.token,
    tokenGenerated: dash.generated,
    tokenFile: dash.file,
  },
};
