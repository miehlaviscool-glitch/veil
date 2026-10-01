// Regenerates every image in docs/ from demo data:  npx electron scripts/screenshots.js
// Uses the same UI code as the real app, backed by a fake Discord client (see test/helpers.js).
const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, ipcMain } = require('electron');

const root = path.join(__dirname, '..');
const out = path.join(root, 'docs');
fs.mkdirSync(path.join(out, 'screenshots'), { recursive: true });
app.setPath('userData', path.join(require('os').tmpdir(), 'veil-shots'));

const { makeCtx } = require('../test/helpers');
const { createApp } = require('../src/dashboard/server');

const TOKEN = 'screenshot-token';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function demoData() {
  const names = ['Pixel Café', 'Dev Den', 'Night Owls', 'Anime Hub', 'Study Group', 'Game Night', 'Art Corner', 'Music Lounge', 'Retro Arcade', 'Book Club'];
  const guilds = names.map((n, i) => ({
    id: '2000000000000000' + String(i).padStart(2, '0'), name: n, memberCount: Math.round(4200 / (i + 1.4)) + 37, ownerId: '111111111111111111',
    createdTimestamp: Date.now() - (200 + i * 40) * 864e5, joinedTimestamp: Date.now() - (30 + i * 25) * 864e5, roles: { cache: { size: 12 + i } }, channels: { cache: { size: 18 + i } }, features: ['COMMUNITY', 'NEWS'],
    fetchOwner: async () => ({ user: { tag: 'founder#0001' } }),
  }));
  const ctx = makeCtx({ guilds });
  ctx.client.user.tag = 'Veil Bot#0001';
  ctx.config.dashboard.token = TOKEN;
  const { store, manager, logger } = ctx;
  const shape = [60, 95, 80, 130, 120, 70, 90, 150, 170, 140, 110, 160, 185, 175];
  shape.forEach((v, i) => { const d = new Date(Date.now() - (13 - i) * 864e5).toISOString().slice(0, 10); store.data.stats.daily[d] = { commands: v, errors: i % 5 === 0 ? 2 : 0, joins: 1, leaves: 0 }; });
  Object.assign(store.data.stats.commandUsage, { ping: 1420, help: 910, stats: 460, guilds: 145, schedule: 96, blacklist: 31 });
  Object.assign(store.data.stats.commandErrors, { stats: 2 });
  guilds.forEach((g, i) => { store.data.stats.guildUsage[g.id] = Math.round(900 / (i + 1)); });
  store.data.guildNotes[guilds[2].id] = 'Partner server: contact via DM';
  logger.min = 0;
  manager.activity('join', 'Joined Pixel Café (3,010 members)');
  manager.activity('admin', 'blacklist.user.add 403918273645102938: spam');
  manager.activity('error', '/stats failed [a1b2c3]: request timed out');
  manager.activity('join', 'Joined Retro Arcade (612 members)');
  manager.activity('leave', 'Removed from Old Test Server');
  manager.activity('admin', 'maintenance.off');
  store.data.activity.forEach((e, i) => { e.ts = Date.now() - (i + 1) * 17 * 60000; });
  manager.addSchedule('demo', { name: 'Weekly event reminder', message: 'Movie night starts at 8pm!', channelId: '555555555555555555', everySec: 604800, at: Date.now() + 2 * 3600e3 });
  manager.addSchedule('demo', { name: 'Maintenance notice', message: 'Brief downtime on Sunday.', broadcast: true, at: Date.now() + 26 * 3600e3 });
  manager.addSchedule('demo', { name: 'Daily tip', message: 'Try /help to see commands.', channelId: '555555555555555556', everySec: 86400, at: Date.now() + 9 * 3600e3 });
  store.data.blacklist.users['403918273645102938'] = { reason: 'Spam', by: 'discord:1', at: Date.now() - 864e5 };
  store.data.blacklist.guilds['777888999000111222'] = { reason: 'Raid server', by: 'dashboard', at: Date.now() - 3 * 864e5 };
  store.data.presence.rotation = { enabled: true, intervalSec: 60, items: [{ type: 'Watching', text: '{guilds} servers' }, { type: 'Playing', text: 'with {users} users' }] };
  store.data.presence.current = { type: 'Watching', text: '{guilds} servers', status: 'online' };
  logger.info('Logged in as Veil Bot#0001 in 10 guild(s).');
  logger.info('Dashboard listening on http://127.0.0.1');
  logger.warn('Rate limited on POST /channels/*/messages, retrying in 1.2s');
  logger.info('[audit] discord:111111111111111111 presence.set online Watching 10 servers');
  logger.error('[a1b2c3] /stats failed: request timed out');
  logger.info('Deployed 16 slash commands to guild 123456789012345678.');
  return ctx;
}

const web = (preload = true) => ({
  backgroundThrottling: false,
  contextIsolation: true, nodeIntegration: false, sandbox: true,
  ...(preload ? { preload: path.join(root, 'electron', 'preload.js') } : {}),
});

const win_invalidate = (w) => { try { w.webContents.invalidate(); } catch {} };
async function shot(win, file) {
  win_invalidate(win);
  await sleep(350);
  const img = await win.webContents.capturePage();
  fs.writeFileSync(file, img.toPNG());
  console.log('wrote', path.relative(root, file));
}
const run = (win, js) => win.webContents.executeJavaScript(js);

async function main() {
  // stub the desktop bridge so the app chrome (start/stop/restart) shows as it does in the real app
  const status = { status: 'online', tag: 'Veil Bot#0001', restarts: 0 };
  for (const ch of ['bot:start', 'bot:stop', 'bot:restart', 'app:openSettings', 'app:quit', 'app:openFolder']) ipcMain.handle(ch, () => {});
  ipcMain.handle('bot:status', () => status);
  ipcMain.handle('app:version', () => '1.0.0');
  ipcMain.handle('settings:get', () => ({ ownerIds: '', devGuildId: '', webhookUrl: '', autoDeploy: true, autoStartBot: true, launchAtLogin: false, minimizeToTray: true, notifications: true, hasToken: false }));
  ipcMain.handle('settings:validateToken', () => ({ ok: true }));

  const ctx = demoData();
  const server = createApp(ctx).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  // ---------------- setup wizard (tall enough that nothing scrolls)
  const wiz = new BrowserWindow({ width: 780, height: 1400, enableLargerThanScreen: true, show: true, x: -4000, y: 0, useContentSize: true, backgroundColor: '#0e1016', webPreferences: web() });
  await wiz.loadURL(require('url').pathToFileURL(path.join(root, 'electron', 'ui', 'setup.html')).href + '?first=1');
  await sleep(500);
  await run(wiz, `(() => { const $=(i)=>document.getElementById(i);
    $('token').value='MTIzNDU2Nzg5MDEyMzQ1Njc4.GabcDe.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
    $('tokenMsg').textContent='Token is valid.'; $('tokenMsg').className='msg ok';
    $('botName').textContent='Veil Bot'; $('botOwner').textContent='Owned by Team: Veil Labs';
    $('botAvatar').classList.add('hidden'); $('botcard').classList.remove('hidden');
    $('botcard').querySelector('img').insertAdjacentHTML('afterend','<div class="ph"></div>');
  })()`);
  await shot(wiz, path.join(out, 'screenshots', 'setup.png'));
  wiz.hide(); // (destroying a window here makes the next load fail under Electron 44)

  // ---------------- dashboard
  const win = new BrowserWindow({ width: 1440, height: 900, show: false, useContentSize: true, backgroundColor: '#0e1016', webPreferences: web() });
  await win.loadURL(`${base}/#token=${TOKEN}`);
  await sleep(1200);
  win.webContents.sendInputEvent({ type: 'mouseMove', x: 1000, y: 880 }); // park the cursor: no stray hover states
  const go = async (view) => { await run(win, `[...document.querySelectorAll('#nav button')].find((x) => x.dataset.view === '${view}').click()`); await sleep(900); };
  const S = (n) => path.join(out, 'screenshots', n + '.png');

  await shot(win, S('overview'));
  await go('Servers'); await shot(win, S('servers'));
  await run(win, `document.querySelector('#view tbody tr:nth-child(3)').click()`); await sleep(700); await shot(win, S('server-detail'));
  await run(win, `closeLayer()`);
  await go('Schedules'); await shot(win, S('schedules'));
  await go('Activity'); await shot(win, S('activity'));
  await go('Presence'); await shot(win, S('presence'));
  await go('Blacklist'); await shot(win, S('blacklist'));
  await go('Commands'); await shot(win, S('commands'));
  await go('Invite'); await shot(win, S('invite'));
  await go('Logs'); await shot(win, S('logs'));
  await go('Settings'); await shot(win, S('settings'));
  await go('Overview');
  await run(win, `openPalette()`); await sleep(300); await shot(win, S('palette'));
  await run(win, `closeLayer(); localStorage.setItem('bm_theme','light'); localStorage.setItem('bm_accent','20,184,166'); applyAppearance(); render();`); await sleep(2200);
  await shot(win, S('overview-light'));
  win.hide();

  // ---------------- banner
  const icon = fs.readFileSync(path.join(root, 'build', 'icon.png')).toString('base64');
  const html = `<!doctype html><meta charset=utf-8><style>
  *{box-sizing:border-box} body{margin:0;width:1280px;height:360px;font-family:"Segoe UI",system-ui,sans-serif;color:#fff;overflow:hidden;
   background:radial-gradient(900px 500px at 85% -10%,rgba(162,89,240,.55),transparent),radial-gradient(700px 420px at 0% 110%,rgba(88,101,242,.5),transparent),#0b0d14;display:flex;align-items:center;padding:0 90px;gap:48px}
  img{width:190px;height:190px;border-radius:44px;box-shadow:0 20px 60px rgba(88,101,242,.55)}
  h1{font-size:112px;margin:0;letter-spacing:-4px;line-height:1;background:linear-gradient(90deg,#fff,#c9ccff);-webkit-background-clip:text;color:transparent}
  p{font-size:30px;margin:10px 0 22px;color:#b9bdd6} .chips{display:flex;gap:12px}
  .c{font-size:18px;padding:7px 18px;border-radius:99px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.07)}
  </style><img src="data:image/png;base64,${icon}"><div><h1>Veil</h1><p>The control center for your Discord bot.</p>
  <div class=chips><span class=c>Desktop app</span><span class=c>Web dashboard</span><span class=c>Slash commands</span><span class=c>Schedules &amp; broadcasts</span></div></div>`;
  const ban = new BrowserWindow({ width: 1280, height: 360, show: false, useContentSize: true, webPreferences: { sandbox: true } });
  await ban.loadURL('data:text/html;base64,' + Buffer.from(html).toString('base64'));
  await sleep(400);
  await shot(ban, path.join(out, 'banner.png'));

  server.close();
  app.exit(0);
}

app.whenReady().then(main).catch((e) => { console.error(e); app.exit(1); });
