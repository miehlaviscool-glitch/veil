const test = require('node:test');
const assert = require('node:assert/strict');
const { makeCtx } = require('./helpers');
const { createApp } = require('../src/dashboard/server');

async function withServer(fn) {
  const ctx = makeCtx({ guilds: [{ id: '333333333333333333', name: 'Test Guild', memberCount: 10 }] });
  const server = createApp(ctx).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (path, { method = 'GET', body, token = 'test-token-123' } = {}) =>
    fetch(base + path, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  try { await fn({ call, ctx, base }); } finally { server.close(); }
}

test('API requires a valid bearer token and sets security headers', () => withServer(async ({ call, base }) => {
  assert.equal((await call('/api/overview', { token: null })).status, 401);
  assert.equal((await call('/api/overview', { token: 'wrong' })).status, 401);
  const ok = await call('/api/overview');
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal(ok.headers.get('x-frame-options'), 'DENY');
  const html = await fetch(base + '/');
  assert.equal(html.status, 200);
}));

test('overview, guilds, commands endpoints', () => withServer(async ({ call }) => {
  const o = await (await call('/api/overview')).json();
  assert.equal(o.guilds, 1);
  assert.equal(o.ready, true);
  const g = await (await call('/api/guilds?q=test')).json();
  assert.equal(g.guilds[0].name, 'Test Guild');
  const cmds = await (await call('/api/commands')).json();
  assert.ok(cmds.some((c) => c.name === 'ping'));
}));

test('mutations: blacklist, maintenance, command toggle, validation, audit', () => withServer(async ({ call, ctx }) => {
  const add = await call('/api/blacklist', { method: 'POST', body: { type: 'user', id: '444444444444444444', reason: 'x' } });
  assert.equal(add.status, 200);
  assert.ok(ctx.store.data.blacklist.users['444444444444444444']);
  assert.equal((await call('/api/blacklist', { method: 'POST', body: { type: 'user', id: 'bad' } })).status, 400);
  assert.equal((await call('/api/blacklist/user/444444444444444444', { method: 'DELETE' })).status, 200);

  await call('/api/maintenance', { method: 'PUT', body: { enabled: true, reason: 'brb' } });
  assert.equal(ctx.store.data.maintenance.enabled, true);

  assert.equal((await call('/api/commands/ping/disable', { method: 'POST', body: {} })).status, 200);
  assert.equal((await call('/api/commands/eval/disable', { method: 'POST', body: {} })).status, 400);
  assert.equal((await call('/api/commands/ping/explode', { method: 'POST', body: {} })).status, 400);

  const audit = await (await call('/api/audit')).json();
  assert.ok(audit.some((e) => e.action === 'maintenance.on' && e.actor === 'dashboard'));
}));

test('brute force throttling locks out after repeated failures', () => withServer(async ({ call }) => {
  for (let i = 0; i < 10; i++) await call('/api/overview', { token: 'bad' });
  assert.equal((await call('/api/overview', { token: 'bad' })).status, 429);
}));

test('malformed JSON is rejected cleanly', () => withServer(async ({ base }) => {
  const res = await fetch(base + '/api/maintenance', { method: 'PUT', headers: { authorization: 'Bearer test-token-123', 'content-type': 'application/json' }, body: '{oops' });
  assert.equal(res.status, 400);
}));

test('new endpoints: schedules, activity, invite, guild detail/note, export', () => withServer(async ({ call, ctx }) => {
  const sched = await (await call('/api/schedules', { method: 'POST', body: { name: 'n', message: 'hi', broadcast: true, everySec: 3600 } })).json();
  assert.ok(sched.id);
  assert.equal((await (await call('/api/schedules')).json()).length, 1);
  assert.equal((await call(`/api/schedules/${sched.id}/toggle`, { method: 'POST' })).status, 200);
  assert.equal((await call(`/api/schedules/${sched.id}`, { method: 'DELETE' })).status, 200);
  assert.equal((await call('/api/schedules', { method: 'POST', body: { message: 'x' } })).status, 400);

  ctx.manager.activity('join', 'hello');
  assert.equal((await (await call('/api/activity')).json())[0].text, 'hello');

  const inv = await (await call('/api/invite?preset=minimal')).json();
  assert.match(inv.url, /discord\.com\/oauth2\/authorize/);
  assert.equal((await call('/api/invite?preset=zzz')).status, 400);

  assert.equal((await call('/api/guilds/not-an-id')).status, 400);
  const exp = await call('/api/export');
  assert.match(exp.headers.get('content-disposition'), /attachment/);
  assert.ok((await exp.json()).blacklist);
}));
