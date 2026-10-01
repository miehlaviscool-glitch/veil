const path = require('path');
const net = require('net');
const fs = require('fs');
const crypto = require('crypto');
const { app, BrowserWindow, Tray, Menu, Notification, ipcMain, shell, nativeImage } = require('electron');

// Allow isolated profiles (used by automated checks) without touching real user data.
if (process.env.BM_USER_DATA) app.setPath('userData', process.env.BM_USER_DATA);

const settings = require('./settings');
const { BotRunner } = require('./botRunner');

const isDev = !app.isPackaged;
const iconPath = path.join(__dirname, '..', 'build', 'icon.png');
const trayPath = path.join(__dirname, '..', 'build', 'tray.png');
const dashToken = crypto.randomBytes(24).toString('base64url');

let mainWindow = null;
let setupWindow = null;
let tray = null;
let quitting = false;
let dashPort = 0;
let currentTarget = null; // 'dash' | 'offline'
let shownTrayHint = false;

app.setAppUserModelId('com.veil.app');
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
app.on('second-instance', () => showMain());

// ---------------------------------------------------------------- bot process
const runner = new BotRunner({
  entry: path.join(app.getAppPath(), 'src', 'index.js'),
  cwd: app.getPath('userData'),
  getEnv: () => {
    const s = settings.load();
    return {
      DISCORD_TOKEN: settings.getToken() || '',
      CLIENT_ID: s.clientId,
      OWNER_IDS: s.ownerIds,
      DEV_GUILD_ID: s.devGuildId,
      LOG_WEBHOOK_URL: s.webhookUrl,
      AUTO_DEPLOY: String(s.autoDeploy),
      LOG_LEVEL: s.logLevel,
      ENABLE_EVAL: 'false',
      DASHBOARD_ENABLED: 'true',
      DASHBOARD_HOST: '127.0.0.1',
      DASHBOARD_PORT: String(dashPort),
      DASHBOARD_TOKEN: dashToken,
      DATA_DIR: path.join(app.getPath('userData'), 'data'),
      LOG_DIR: path.join(app.getPath('userData'), 'logs'),
    };
  },
});

const NOTIFY_TITLES = /^(Joined a guild|Left a guild|Command error|Unhandled rejection|Bot online)/;
runner.on('notify', (m) => {
  if (!settings.load().notifications || !NOTIFY_TITLES.test(m.title) || !Notification.isSupported()) return;
  const n = new Notification({ title: m.title, body: m.description.replace(/[*`]/g, '').slice(0, 200), icon: iconPath, silent: m.title.startsWith('Bot online') });
  n.on('click', showMain);
  n.show();
});

runner.on('status', (state) => {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('bot:status', state);
  buildTray();
  syncMainView();
  tray?.setToolTip(`Veil — ${state.status}${state.tag ? ` (${state.tag})` : ''}`);
});

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
  });
}

// ---------------------------------------------------------------- windows
const secureWeb = {
  preload: path.join(__dirname, 'preload.js'),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
};

function lockNavigation(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    const ok = url.startsWith(`http://127.0.0.1:${dashPort}/`) || url.startsWith('file://');
    if (!ok) { e.preventDefault(); if (/^https:\/\//.test(url)) shell.openExternal(url); }
  });
}

function createMain() {
  mainWindow = new BrowserWindow({
    width: 1320, height: 860, minWidth: 940, minHeight: 600,
    show: false,
    title: 'Veil',
    icon: iconPath,
    backgroundColor: '#0e1016',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0e1016', symbolColor: '#c9cde0', height: 40 },
    webPreferences: secureWeb,
  });
  Menu.setApplicationMenu(null);
  lockNavigation(mainWindow);
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('close', (e) => {
    if (quitting) return;
    if (settings.load().minimizeToTray) {
      e.preventDefault();
      mainWindow.hide();
      if (!shownTrayHint && Notification.isSupported()) {
        shownTrayHint = true;
        new Notification({ title: 'Veil is still running', body: 'Your bot keeps running in the system tray. Right-click the tray icon to quit.', icon: iconPath }).show();
      }
    } else { quit(); }
  });
  mainWindow.on('closed', () => { mainWindow = null; currentTarget = null; });
  currentTarget = null;
  syncMainView();
}

async function waitForPort(port, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const ok = await new Promise((r) => { const s = net.connect(port, '127.0.0.1', () => { s.destroy(); r(true); }); s.on('error', () => r(false)); });
    if (ok) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

/** Shows the live dashboard when the bot is online, otherwise the local status page. */
async function syncMainView() {
  if (!mainWindow) return;
  const wantDash = runner.state.status === 'online';
  const target = wantDash ? 'dash' : 'offline';
  if (target === currentTarget) return;
  currentTarget = target;
  if (target === 'dash') {
    if (!(await waitForPort(dashPort))) { currentTarget = null; return; }
    if (!mainWindow || currentTarget !== 'dash') return;
    mainWindow.loadURL(`http://127.0.0.1:${dashPort}/#token=${dashToken}`);
  } else {
    mainWindow.loadFile(path.join(__dirname, 'ui', 'offline.html'));
  }
}

function showMain() {
  if (!mainWindow) createMain();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function openSetup(firstRun = false) {
  if (setupWindow) { setupWindow.focus(); return; }
  setupWindow = new BrowserWindow({
    width: 760, height: 780, minWidth: 620, minHeight: 600,
    parent: firstRun ? undefined : mainWindow || undefined,
    title: firstRun ? 'Welcome to Veil' : 'Settings',
    icon: iconPath,
    backgroundColor: '#0e1016',
    autoHideMenuBar: true,
    webPreferences: secureWeb,
  });
  lockNavigation(setupWindow);
  setupWindow.loadFile(path.join(__dirname, 'ui', 'setup.html'), { query: { first: firstRun ? '1' : '0' } });
  setupWindow.on('closed', () => {
    setupWindow = null;
    // Closing the wizard without finishing on first run means there is nothing to manage.
    if (!settings.hasToken() && !quitting) quit();
  });
}

// ---------------------------------------------------------------- tray
function buildTray() {
  if (!tray) {
    tray = new Tray(nativeImage.createFromPath(trayPath));
    tray.on('click', showMain);
  }
  const { status, tag } = runner.state;
  const running = ['starting', 'online', 'crashed'].includes(status);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: tag ? `${tag} — ${status}` : `Bot ${status}`, enabled: false },
    { type: 'separator' },
    { label: 'Open dashboard', click: showMain },
    { label: running ? 'Stop bot' : 'Start bot', click: () => (running ? runner.stop() : runner.start()) },
    { label: 'Restart bot', enabled: running, click: () => runner.restart() },
    { type: 'separator' },
    { label: 'Settings…', click: () => openSetup(false) },
    { label: 'Open data folder', click: () => shell.openPath(app.getPath('userData')) },
    { type: 'separator' },
    { label: 'Quit Veil', click: quit },
  ]));
}

async function quit() {
  if (quitting) return;
  quitting = true;
  await runner.stop();
  app.exit(0);
}

// ---------------------------------------------------------------- Discord token check
async function validateToken(token) {
  token = String(token || '').trim();
  if (!/^[\w-]{20,}\.[\w-]{5,}\.[\w-]{20,}$/.test(token)) return { ok: false, error: 'That does not look like a bot token (expected three parts separated by dots).' };
  try {
    const headers = { Authorization: `Bot ${token}` };
    const res = await fetch('https://discord.com/api/v10/users/@me', { headers, signal: AbortSignal.timeout(10_000) });
    if (res.status === 401) return { ok: false, error: 'Discord rejected this token. Reset it in the Developer Portal and paste the new one.' };
    if (!res.ok) return { ok: false, error: `Discord returned ${res.status}. Try again in a moment.` };
    const me = await res.json();
    const app2 = await fetch('https://discord.com/api/v10/oauth2/applications/@me', { headers, signal: AbortSignal.timeout(10_000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    return {
      ok: true,
      id: me.id,
      username: me.username,
      avatar: me.avatar ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=128` : null,
      owner: app2?.team ? `Team: ${app2.team.name ?? 'unnamed'}` : app2?.owner?.username ?? null,
    };
  } catch (e) {
    return { ok: false, error: `Could not reach Discord (${e.message}). Check your internet connection.` };
  }
}

// ---------------------------------------------------------------- IPC
const snowflakes = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);

ipcMain.handle('app:version', () => app.getVersion());
ipcMain.handle('bot:status', () => runner.state);
ipcMain.handle('bot:start', () => runner.start());
ipcMain.handle('bot:stop', () => runner.stop());
ipcMain.handle('bot:restart', () => runner.restart());
ipcMain.handle('app:openSettings', () => openSetup(false));
ipcMain.handle('app:quit', () => quit());
ipcMain.handle('app:closeWindow', (e) => BrowserWindow.fromWebContents(e.sender)?.close());
ipcMain.handle('app:openFolder', (_e, which) => shell.openPath(which === 'logs' ? path.join(app.getPath('userData'), 'logs') : app.getPath('userData')));
ipcMain.handle('settings:get', () => ({ ...settings.load(), hasToken: settings.hasToken() }));
ipcMain.handle('settings:validateToken', (_e, token) => validateToken(token));

ipcMain.handle('settings:save', async (_e, p) => {
  const patch = {
    ownerIds: snowflakes(p.ownerIds).join(','),
    devGuildId: String(p.devGuildId || '').trim(),
    webhookUrl: String(p.webhookUrl || '').trim(),
    autoDeploy: !!p.autoDeploy,
    autoStartBot: !!p.autoStartBot,
    launchAtLogin: !!p.launchAtLogin,
    minimizeToTray: !!p.minimizeToTray,
    notifications: !!p.notifications,
  };
  if (snowflakes(patch.ownerIds).some((id) => !/^\d{15,25}$/.test(id))) return { ok: false, error: 'Owner IDs must be numeric Discord user IDs, separated by commas.' };
  if (patch.devGuildId && !/^\d{15,25}$/.test(patch.devGuildId)) return { ok: false, error: 'Test server ID must be a numeric Discord server ID.' };
  if (patch.webhookUrl && !/^https:\/\/(discord|discordapp)\.com\/api\/webhooks\//.test(patch.webhookUrl)) return { ok: false, error: 'Webhook must be a Discord webhook URL.' };

  const newToken = String(p.token || '').trim();
  if (newToken) {
    const v = await validateToken(newToken);
    if (!v.ok) return v;
    try { settings.setToken(newToken); } catch (e) { return { ok: false, error: e.message }; }
    patch.clientId = v.id;
  } else if (!settings.hasToken()) {
    return { ok: false, error: 'A bot token is required.' };
  }
  settings.save(patch);
  app.setLoginItemSettings({ openAtLogin: patch.launchAtLogin });

  const wasFirst = !mainWindow;
  setupWindow?.removeAllListeners('closed');
  setupWindow?.close();
  setupWindow = null;
  if (wasFirst) createMain();
  await runner.restart();
  return { ok: true };
});

// ---------------------------------------------------------------- boot
app.whenReady().then(async () => {
  dashPort = await freePort();
  buildTray();

  if (!settings.hasToken()) { openSetup(true); }
  else {
    createMain();
    if (settings.load().autoStartBot) runner.start();
  }

  // Dev/CI helper: render windows to PNG files then exit (used for automated visual checks).
  if (process.env.BM_SCREENSHOT) {
    setTimeout(async () => {
      const dir = process.env.BM_SCREENSHOT;
      fs.mkdirSync(dir, { recursive: true });
      for (const [i, w] of BrowserWindow.getAllWindows().entries()) {
        const img = await w.webContents.capturePage();
        fs.writeFileSync(path.join(dir, `window-${i}.png`), img.toPNG());
      }
      quit();
    }, Number(process.env.BM_SCREENSHOT_DELAY) || 5000);
  }
});

app.on('window-all-closed', () => { /* stay alive in the tray */ });
app.on('before-quit', (e) => { if (!quitting) { e.preventDefault(); quit(); } });
