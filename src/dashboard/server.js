const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { isSnowflake } = require('../util');

const ACTOR = 'dashboard';

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/** Builds the Express app (separate from listen() so tests can drive it). */
function createApp({ client, store, logger, config, manager }) {
  const app = express();
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    res.set({
      'Content-Security-Policy': "default-src 'self'; img-src 'self' https://cdn.discordapp.com data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'",
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'no-store',
    });
    next();
  });
  app.use(express.static(path.join(__dirname, 'public')));
  app.use(express.json({ limit: '100kb' }));

  // --- auth with brute-force throttling (10 failures / 5 min / IP) ---
  const failures = new Map();
  app.use('/api', (req, res, next) => {
    const ip = req.ip;
    const rec = failures.get(ip);
    if (rec && rec.until > Date.now() && rec.count >= 10) return res.status(429).json({ error: 'Too many failed attempts. Try again later.' });
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token || !safeEqual(token, config.dashboard.token)) {
      const r = rec && rec.until > Date.now() ? rec : { count: 0, until: Date.now() + 300_000 };
      r.count++;
      failures.set(ip, r);
      logger.warn(`Dashboard auth failure from ${ip}`);
      return res.status(401).json({ error: 'Unauthorized' });
    }
    failures.delete(ip);
    next();
  });

  const wrap = (fn) => async (req, res) => {
    try {
      res.json((await fn(req, res)) ?? { ok: true });
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message });
    }
  };
  const needId = (id) => { if (!isSnowflake(id)) throw new Error('Invalid ID.'); return id; };

  app.get('/api/overview', wrap(() => ({ ...manager.stats(), ready: client.isReady?.() ?? false })));
  app.get('/api/guilds', wrap((req) => manager.listGuilds({ q: String(req.query.q || ''), sort: String(req.query.sort || 'members'), page: Number(req.query.page) || 1, perPage: 25 })));
  app.get('/api/guilds/:id', wrap((req) => manager.guildDetail(needId(req.params.id))));
  app.put('/api/guilds/:id/note', wrap((req) => manager.setGuildNote(ACTOR, needId(req.params.id), req.body?.note)));
  app.post('/api/guilds/:id/leave', wrap((req) => manager.leaveGuild(ACTOR, needId(req.params.id), req.body?.reason || '').then((name) => ({ ok: true, name }))));

  app.get('/api/blacklist', wrap(() => store.data.blacklist));
  app.post('/api/blacklist', wrap(async (req) => { await manager.blacklistAdd(ACTOR, req.body.type, req.body.id, req.body.reason); }));
  app.delete('/api/blacklist/:type/:id', wrap((req) => manager.blacklistRemove(ACTOR, req.params.type, req.params.id)));

  app.get('/api/commands', wrap(() => manager.listCommands()));
  app.post('/api/commands/reload', wrap(async () => ({ ok: true, count: await manager.reloadCommands(ACTOR) })));
  app.post('/api/commands/:name/:state', wrap((req) => {
    if (!['enable', 'disable'].includes(req.params.state)) throw new Error('State must be enable or disable.');
    manager.setCommandEnabled(ACTOR, req.params.name, req.params.state === 'enable', req.body?.reason || '');
  }));

  app.get('/api/presence', wrap(() => store.data.presence));
  app.put('/api/presence', wrap((req) => manager.setPresence(ACTOR, req.body || {})));
  app.put('/api/presence/rotation', wrap((req) => manager.setRotation(ACTOR, req.body || {})));

  app.get('/api/maintenance', wrap(() => store.data.maintenance));
  app.put('/api/maintenance', wrap((req) => manager.setMaintenance(ACTOR, !!req.body?.enabled, req.body?.reason || '')));

  app.get('/api/managers', wrap(() => store.data.managers));
  app.post('/api/managers', wrap((req) => manager.addManager(ACTOR, needId(req.body?.id))));
  app.delete('/api/managers/:id', wrap((req) => manager.removeManager(ACTOR, req.params.id)));

  app.get('/api/schedules', wrap(() => store.data.schedules));
  app.post('/api/schedules', wrap((req) => manager.addSchedule(ACTOR, req.body || {})));
  app.delete('/api/schedules/:id', wrap((req) => manager.removeSchedule(ACTOR, req.params.id)));
  app.post('/api/schedules/:id/toggle', wrap((req) => manager.toggleSchedule(ACTOR, req.params.id)));
  app.post('/api/schedules/:id/run', wrap(async (req) => ({ ok: true, result: await manager.runScheduleNow(ACTOR, req.params.id) })));

  app.get('/api/activity', wrap((req) => store.data.activity.slice(-Math.min(200, Number(req.query.limit) || 100)).reverse()));
  app.get('/api/invite', wrap((req) => ({ url: manager.inviteUrl(String(req.query.preset || 'minimal')), presets: Object.entries(manager.invitePresets()).map(([k, v]) => ({ id: k, label: v.label })) })));
  app.get('/api/export', (req, res) => {
    res.set('Content-Disposition', 'attachment; filename="veil-data.json"');
    res.json(store.data);
  });

  app.post('/api/broadcast', wrap((req) => manager.startBroadcast(ACTOR, req.body || {})));
  app.get('/api/jobs', wrap(() => [...manager.jobs.values()].reverse()));

  app.get('/api/logs', wrap((req) => logger.tail({ limit: Math.min(500, Number(req.query.limit) || 100), level: req.query.level || undefined, since: Number(req.query.since) || 0 })));
  app.get('/api/audit', wrap((req) => store.data.audit.slice(-Math.min(200, Number(req.query.limit) || 100)).reverse()));

  app.get('/api/backups', wrap(() => store.listBackups()));
  app.post('/api/backups', wrap(() => ({ ok: true, name: manager.backup(ACTOR) })));
  app.post('/api/backups/restore', wrap((req) => manager.restoreBackup(ACTOR, String(req.body?.name || ''))));

  app.post('/api/restart', wrap(() => manager.restart(ACTOR)));
  app.post('/api/shutdown', wrap(() => manager.shutdown(ACTOR)));

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
  app.use((err, req, res, next) => res.status(err.status || 400).json({ error: err.type === 'entity.parse.failed' ? 'Invalid JSON' : 'Bad request' }));
  return app;
}

function startDashboard(ctx) {
  const { config, logger } = ctx;
  const { host, port } = config.dashboard;
  const server = createApp(ctx).listen(port, host, () => {
    logger.info(`Dashboard listening on http://${host}:${port}`);
    // Printed directly to the console only (never into the log buffer/files/webhook).
    if (config.dashboard.tokenGenerated) console.log(`\n  Dashboard access token (also saved to ${config.dashboard.tokenFile}):\n  ${config.dashboard.token}\n`);
    if (host !== '127.0.0.1' && host !== 'localhost') logger.warn('Dashboard is exposed beyond localhost over plain HTTP. Put it behind a TLS reverse proxy.');
  });
  server.on('error', (e) => logger.error('Dashboard failed to start:', e.message));
  return server;
}

module.exports = { createApp, startDashboard };
