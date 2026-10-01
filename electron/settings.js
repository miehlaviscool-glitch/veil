const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');

const DEFAULTS = {
  clientId: '',
  ownerIds: '',
  devGuildId: '',
  webhookUrl: '',
  autoDeploy: true,
  autoStartBot: true,
  launchAtLogin: false,
  minimizeToTray: true,
  notifications: true,
  logLevel: 'info',
};

const dir = () => app.getPath('userData');
const settingsFile = () => path.join(dir(), 'settings.json');
const tokenFile = () => path.join(dir(), 'token.dat');

function load() {
  try { return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) }; } catch { return { ...DEFAULTS }; }
}

function save(partial) {
  const next = { ...load(), ...partial };
  fs.mkdirSync(dir(), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify(next, null, 2));
  return next;
}

/** The bot token is encrypted with the OS keystore (DPAPI on Windows) and never written in plain text. */
function getToken() {
  try {
    const buf = fs.readFileSync(tokenFile());
    return safeStorage.decryptString(buf);
  } catch { return null; }
}

function setToken(token) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure storage is not available on this system, so the token cannot be saved safely.');
  fs.mkdirSync(dir(), { recursive: true });
  fs.writeFileSync(tokenFile(), safeStorage.encryptString(token), { mode: 0o600 });
}

const hasToken = () => fs.existsSync(tokenFile()) && !!getToken();

module.exports = { load, save, getToken, setToken, hasToken, DEFAULTS };
