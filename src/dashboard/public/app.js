'use strict';
// Vanilla dashboard. All dynamic content goes in via textContent / DOM APIs (never innerHTML) to rule out XSS,
// and styles are applied through the CSSOM so the strict CSP (no inline styles/scripts) holds.

const $ = (s) => document.querySelector(s);
const shell = window.desktop || null; // bridge injected by the Electron preload (absent in a normal browser)
let token = sessionStorage.getItem('bm_token') || '';
let timer = null;

// Desktop shell hands over the token in the URL hash; scrub it from history immediately.
if (location.hash.startsWith('#token=')) {
  token = decodeURIComponent(location.hash.slice(7));
  sessionStorage.setItem('bm_token', token);
  history.replaceState(null, '', location.pathname);
}
if (shell) document.documentElement.classList.add('desktop');

// ---------------------------------------------------------------- helpers
const SVG = 'http://www.w3.org/2000/svg';
const ICONS = {
  home: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10',
  server: 'M4 2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z M4 14h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2z M6 6h.01 M6 18h.01',
  activity: 'M22 12h-4l-3 9L9 3l-3 9H2',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 6v6l4 2',
  ban: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M4.9 4.9l14.2 14.2',
  command: 'M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z',
  sliders: 'M4 21v-7 M4 10V3 M12 21v-9 M12 8V3 M20 21v-5 M20 12V3 M1 14h6 M9 8h6 M17 16h6',
  send: 'M22 2L11 13 M22 2l-7 20-4-9-9-4 20-7z',
  link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7 M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
  terminal: 'M4 17l6-6-6-6 M12 19h8',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8',
  settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M12 2v3 M12 19v3 M2 12h3 M19 12h3 M4.9 4.9l2.1 2.1 M17 17l2.1 2.1 M4.9 19.1L7 17 M17 7l2.1-2.1',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.9 M16 3.1a4 4 0 0 1 0 7.8',
  wifi: 'M5 12.5a10 10 0 0 1 14 0 M8.5 16a5 5 0 0 1 7 0 M12 20h.01',
  cpu: 'M4 4h16v16H4z M9 9h6v6H9z M9 1v3 M15 1v3 M9 20v3 M15 20v3 M20 9h3 M20 14h3 M1 9h3 M1 14h3',
  zap: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  play: 'M5 3l14 9-14 9V3z',
  stop: 'M5 5h14v14H5z',
  refresh: 'M23 4v6h-6 M1 20v-6h6 M3.5 9a9 9 0 0 1 14.9-3.4L23 10 M1 14l4.6 4.4A9 9 0 0 0 20.5 15',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.3-4.3',
};

function icon(name) {
  const s = document.createElementNS(SVG, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('class', 'ic');
  for (const d of (ICONS[name] || '').split(' M').map((p, i) => (i ? 'M' + p : p))) {
    const p = document.createElementNS(SVG, 'path');
    p.setAttribute('d', d);
    s.append(p);
  }
  return s;
}

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v; // CSSOM is CSP-safe; style attributes are not
    else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}

function toast(msg, err) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast show' + (err ? ' err' : '');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.className = 'toast'), 3200);
}

async function api(path, method = 'GET', body) {
  const res = await fetch('/api' + path, {
    method,
    headers: { authorization: 'Bearer ' + token, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { logout(); throw new Error('Session expired'); }
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

async function act(fn, ok) {
  try { const r = await fn(); if (ok) toast(ok); return r; } catch (e) { toast(e.message, true); }
}

const fmtNum = (n) => Number(n).toLocaleString();
const fmtTime = (ms) => new Date(ms).toLocaleString();
const mb = (b) => (b / 1048576).toFixed(0) + ' MB';
function ago(ms) {
  const s = Math.max(1, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.round(s / 60) + 'm ago';
  if (s < 86400) return Math.round(s / 3600) + 'h ago';
  return Math.round(s / 86400) + 'd ago';
}
const every = (sec) => (sec % 86400 === 0 ? `${sec / 86400}d` : sec % 3600 === 0 ? `${sec / 3600}h` : `${Math.round(sec / 60)}m`);
const until = (ms) => {
  const s = Math.round((ms - Date.now()) / 1000);
  return s <= 0 ? 'any moment' : s < 3600 ? `in ${Math.max(1, Math.round(s / 60))}m` : s < 86400 ? `in ${Math.round(s / 3600)}h` : `in ${Math.round(s / 86400)}d`;
};

const stat = (ic, l, v) => h('div', { class: 'stat' }, h('div', { class: 'ico' }, icon(ic)), h('div', {}, h('div', { class: 'v' }, v), h('div', { class: 'l' }, l)));
const table = (heads, rows, onRow) => rows.length
  ? h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, heads.map((x) => h('th', {}, x)))),
    h('tbody', {}, rows.map((r, i) => h('tr', onRow ? { class: 'click', onclick: () => onRow(i) } : {}, r.map((c) => h('td', {}, c)))))))
  : h('div', { class: 'tablewrap' }, h('div', { class: 'empty' }, 'Nothing here yet.'));
const card = (title, ...body) => h('div', { class: 'card' }, title ? h('h3', {}, title) : null, ...body);

function countUp(el, to) {
  if (!Number.isFinite(to)) return;
  const start = performance.now();
  const step = (t) => {
    const p = Math.min(1, (t - start) / 600);
    el.textContent = fmtNum(Math.round(to * (1 - Math.pow(1 - p, 3))));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ---------------------------------------------------------------- modal / drawer
const layer = () => $('#layer');
function closeLayer() { layer().replaceChildren(); }
function overlay(child, dismissable = true) {
  const o = h('div', { class: 'overlay', onclick: (e) => { if (dismissable && e.target === o) closeLayer(); } }, child);
  layer().replaceChildren(o);
  return o;
}
function ask(title, message, okLabel = 'Confirm', danger = true) {
  return new Promise((resolve) => {
    const done = (v) => { closeLayer(); resolve(v); };
    overlay(h('div', { class: 'modal' }, h('h3', {}, title), h('p', { class: 'muted' }, message),
      h('div', { class: 'actions' }, h('button', { onclick: () => done(false) }, 'Cancel'), h('button', { class: danger ? 'danger' : 'primary', onclick: () => done(true) }, okLabel))), false);
  });
}
const confirmThen = (title, msg, fn, label) => async () => { if (await ask(title, msg, label)) fn(); };

// ---------------------------------------------------------------- appearance
const ACCENTS = { Blurple: '88,101,242', Violet: '162,89,240', Teal: '20,184,166', Green: '34,197,94', Orange: '249,115,22', Rose: '244,63,94' };
function applyAppearance() {
  const theme = localStorage.getItem('bm_theme') || 'dark';
  const resolved = theme === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme;
  document.documentElement.dataset.theme = resolved;
  const rgb = localStorage.getItem('bm_accent') || ACCENTS.Blurple;
  const root = document.documentElement.style;
  root.setProperty('--accent-rgb', rgb);
  root.setProperty('--accent', `rgb(${rgb})`);
}
applyAppearance();

// ---------------------------------------------------------------- views
const NAV = [
  ['Overview', 'home'], ['Servers', 'server'], ['Activity', 'activity'],
  '—Automate',
  ['Schedules', 'clock'], ['Broadcast', 'send'], ['Presence', 'sliders'],
  '—Control',
  ['Blacklist', 'ban'], ['Commands', 'command'], ['Invite', 'link'],
  '—System',
  ['Logs', 'terminal'], ['Audit', 'file'], ['Settings', 'settings'],
];
const page = (...kids) => h('div', { class: 'page' }, ...kids);

const views = {
  async Overview(root) {
    const [s, feed] = await Promise.all([api('/overview'), api('/activity?limit=8')]);
    $('#brand').textContent = s.tag || 'Veil';
    if (s.avatar) $('#logo').replaceChildren(h('img', { src: s.avatar, alt: '' }));
    const days = [];
    for (let i = 13; i >= 0; i--) { const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10); days.push([d, s.daily[d] || { commands: 0, errors: 0 }]); }
    const max = Math.max(1, ...days.map(([, d]) => d.commands));
    const top = Object.entries(s.usage).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const topMax = top[0]?.[1] || 1;
    const gMax = s.topGuilds[0]?.uses || 1;

    const nums = {};
    const big = (key, ic, label, val, suffix = '') => { const v = h('span', {}, suffix ? val : '0'); nums[key] = [v, val]; return h('div', { class: 'stat' }, h('div', { class: 'ico' }, icon(ic)), h('div', {}, h('div', { class: 'v' }, v, suffix), h('div', { class: 'l' }, label))); };
    root.replaceChildren(page(h('div', { class: 'stack' },
      h('div', { class: 'grid' },
        big('g', 'server', 'Servers', s.guilds), big('u', 'users', 'Users (approx.)', s.users),
        big('p', 'wifi', 'Gateway ping', Math.max(0, s.ping), ' ms'),
        stat('clock', 'Uptime', s.uptime), stat('cpu', 'Memory', mb(s.memory.rss)), stat('zap', 'Scheduled jobs active', String(s.schedules))),
      h('div', { class: 'cols2' },
        card('Commands per day', h('div', { class: 'bars' }, days.map(([d, v]) => h('div', { class: 'col', title: `${d}: ${v.commands} commands, ${v.errors} errors` },
          h('div', { class: 'bar', style: `height:${Math.max(3, (v.commands / max) * 100)}%` }), h('div', { class: 'lbl' }, d.slice(8)))))),
        card('Recent activity', feed.length ? h('div', { class: 'feed' }, feed.map((e) => h('div', { class: 'item' }, h('span', { class: 'dot ' + e.type }), e.text, h('time', {}, ago(e.ts))))) : h('p', { class: 'muted' }, 'Events will appear here as they happen.'))),
      h('div', { class: 'cols2' },
        card('Top commands', top.length ? top.map(([n, c]) => h('div', { class: 'hbar' }, h('span', { class: 'n' }, '/' + n), h('div', { class: 'track' }, h('div', { class: 'fill', style: `width:${(c / topMax) * 100}%` })), fmtNum(c))) : h('p', { class: 'muted' }, 'No usage yet.')),
        card('Most active servers', s.topGuilds.length ? s.topGuilds.map((g) => h('div', { class: 'hbar' }, h('span', { class: 'n', title: g.name }, g.name), h('div', { class: 'track' }, h('div', { class: 'fill', style: `width:${(g.uses / gMax) * 100}%` })), fmtNum(g.uses))) : h('p', { class: 'muted' }, 'No server activity yet.'))))));
    for (const [el, val] of Object.values(nums)) countUp(el, val);
    setPill(s);
    schedule(10000);
  },

  async Servers(root) {
    const state = views.Servers.state || (views.Servers.state = { q: '', sort: 'members', page: 1 });
    const r = await api(`/guilds?q=${encodeURIComponent(state.q)}&sort=${state.sort}&page=${state.page}`);
    const q = h('input', { type: 'text', placeholder: 'Search by name or ID…', value: state.q });
    const sort = h('select', {}, [['members', 'Most members'], ['name', 'Name'], ['newest', 'Newest joined'], ['oldest', 'Oldest joined']].map(([v, l]) => h('option', { value: v, selected: v === state.sort }, l)));
    const go = () => { state.q = q.value; state.sort = sort.value; state.page = 1; render(); };
    q.addEventListener('keydown', (e) => e.key === 'Enter' && go());
    sort.addEventListener('change', go);
    root.replaceChildren(page(
      h('div', { class: 'row grow' }, q, sort, h('button', { onclick: go }, icon('search'), 'Search')),
      table(['Server', 'Members', 'Joined'], r.guilds.map((g) => [
        h('span', {}, g.icon ? h('img', { class: 'avatar', src: g.icon, alt: '' }) : h('span', { class: 'avatar' }), g.name, g.blacklisted ? ' 🚫' : ''),
        fmtNum(g.memberCount), g.joinedAt ? fmtTime(g.joinedAt) : '-',
      ]), (i) => openGuild(r.guilds[i].id)),
      h('div', { class: 'row', style: 'margin-top:12px' },
        h('button', { disabled: r.page <= 1, onclick: () => { state.page--; render(); } }, '‹ Prev'),
        h('span', { class: 'muted' }, `Page ${r.page}/${r.pages} · ${fmtNum(r.total)} servers`),
        h('button', { disabled: r.page >= r.pages, onclick: () => { state.page++; render(); } }, 'Next ›'))));
  },

  async Activity(root) {
    const rows = await api('/activity?limit=200');
    root.replaceChildren(page(card('Everything that happened', rows.length
      ? h('div', { class: 'feed' }, rows.map((e) => h('div', { class: 'item' }, h('span', { class: 'dot ' + e.type }), e.text, h('time', { title: fmtTime(e.ts) }, ago(e.ts)))))
      : h('p', { class: 'muted' }, 'No events yet. Joins, leaves, errors and admin actions are listed here.'))));
    schedule(8000);
  },

  async Schedules(root) {
    const list = await api('/schedules');
    const name = h('input', { type: 'text', placeholder: 'Name (e.g. Weekly reminder)', maxlength: 60 });
    const msg = h('textarea', { placeholder: 'Message (max 1900 characters)', maxlength: 1900 });
    const mode = h('select', {}, h('option', { value: 'channel' }, 'Post to one channel'), h('option', { value: 'broadcast' }, 'Broadcast to all servers'));
    const chan = h('input', { type: 'text', placeholder: 'Channel ID' });
    const when = h('input', { type: 'datetime-local' });
    const d = new Date(Date.now() + 5 * 60000); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); when.value = d.toISOString().slice(0, 16);
    const every = h('select', {}, [['0', 'Does not repeat'], ['3600', 'Every hour'], ['21600', 'Every 6 hours'], ['86400', 'Every day'], ['604800', 'Every week']].map(([v, l]) => h('option', { value: v }, l)));
    mode.addEventListener('change', () => chan.classList.toggle('hidden', mode.value === 'broadcast'));
    root.replaceChildren(page(h('div', { class: 'stack' },
      card('New scheduled message', h('div', { class: 'stack' }, name, msg,
        h('div', { class: 'row' }, mode, chan, when, every),
        h('div', {}, h('button', { class: 'primary', onclick: () => act(() => api('/schedules', 'POST', { name: name.value, message: msg.value, broadcast: mode.value === 'broadcast', channelId: chan.value.trim(), at: new Date(when.value).getTime(), everySec: Number(every.value) || undefined }).then(render), 'Scheduled') }, icon('clock'), 'Schedule')))),
      table(['', 'Name', 'Target', 'Next run', 'Repeat', 'Runs', ''], list.map((s) => [
        h('span', { class: 'pill ' + (s.enabled ? 'ok' : 'warn') }, s.enabled ? 'on' : 'off'), s.name,
        s.target.type === 'broadcast' ? 'All servers' : h('span', { class: 'mono' }, s.target.channelId),
        s.nextRun ? until(s.nextRun) : 'done', s.everySec ? every(s.everySec) : 'once', `${s.runs}${s.lastResult ? ' · ' + s.lastResult : ''}`,
        h('span', { class: 'row', style: 'margin:0' },
          h('button', { class: 'sm', onclick: () => act(() => api(`/schedules/${s.id}/run`, 'POST').then(render), 'Triggered') }, 'Run now'),
          h('button', { class: 'sm', onclick: () => act(() => api(`/schedules/${s.id}/toggle`, 'POST').then(render)) }, s.enabled ? 'Pause' : 'Resume'),
          h('button', { class: 'sm danger', onclick: () => act(() => api(`/schedules/${s.id}`, 'DELETE').then(render), 'Removed') }, 'Delete')),
      ])))));
  },

  async Broadcast(root) {
    const msg = h('textarea', { placeholder: 'Announcement text (max 1900 chars)', maxlength: 1900 });
    const target = h('select', {}, h('option', { value: 'channels' }, 'Server channels'), h('option', { value: 'owners' }, "Server owners' DMs"));
    const dry = h('input', { type: 'checkbox', checked: true });
    const jobs = await api('/jobs');
    const send = async () => {
      if (!dry.checked && !(await ask('Send to all servers?', 'This posts your message in every server right now.', 'Send broadcast'))) return;
      act(() => api('/broadcast', 'POST', { message: msg.value, target: target.value, dryRun: dry.checked }).then(render), 'Broadcast started');
    };
    root.replaceChildren(page(h('div', { class: 'stack' },
      card('New broadcast', msg, h('div', { class: 'row', style: 'margin:10px 0 0' }, target, h('label', { class: 'check' }, dry, 'Dry run (count only)'), h('button', { class: 'primary', onclick: send }, icon('send'), 'Start'))),
      h('h3', {}, 'Recent jobs'),
      table(['ID', 'Mode', 'Status', 'Progress', 'Sent', 'Failed', 'Skipped'], jobs.map((j) => [j.id, (j.dryRun ? 'dry run · ' : '') + j.target, h('span', { class: 'pill ' + (j.status === 'running' ? 'warn' : 'ok') }, j.status), `${j.done}/${j.total}`, String(j.sent), String(j.failed), String(j.skipped)])))));
    if (jobs.some((j) => j.status === 'running')) schedule(2000);
  },

  async Presence(root) {
    const p = await api('/presence');
    const type = h('select', {}, ['Playing', 'Watching', 'Listening', 'Competing', 'Custom'].map((t) => h('option', { value: t, selected: t === p.current.type }, t)));
    const text = h('input', { type: 'text', placeholder: 'e.g. Watching {guilds} servers', value: p.current.text, maxlength: 128 });
    const status = h('select', {}, ['online', 'idle', 'dnd', 'invisible'].map((t) => h('option', { value: t, selected: t === p.current.status }, t)));
    const rot = p.rotation;
    const items = h('textarea', { placeholder: 'One per line:  Type | Text\nWatching | {guilds} servers\nPlaying | with {users} users' }, rot.items.map((i) => `${i.type} | ${i.text}`).join('\n'));
    const interval = h('input', { type: 'number', min: 15, max: 3600, value: rot.intervalSec, style: 'width:90px' });
    const enabled = h('input', { type: 'checkbox', checked: rot.enabled });
    const parse = () => items.value.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const [t, ...r] = l.split('|'); return { type: t.trim(), text: r.join('|').trim() }; });
    root.replaceChildren(page(h('div', { class: 'stack' },
      card('Static presence', h('p', { class: 'muted' }, 'Placeholders: {guilds} {users} {uptime} {ping} {commands}'), h('div', { class: 'row grow' }, status, type, text,
        h('button', { class: 'primary', onclick: () => act(() => api('/presence', 'PUT', { type: type.value, text: text.value, status: status.value }), 'Presence updated') }, 'Apply'))),
      card('Rotation', items, h('div', { class: 'row', style: 'margin:10px 0 0' }, h('label', { class: 'check' }, enabled, 'Enabled'), h('label', { class: 'check' }, 'Every ', interval, ' seconds'),
        h('button', { class: 'primary', onclick: () => act(() => api('/presence/rotation', 'PUT', { enabled: enabled.checked, intervalSec: Number(interval.value), items: parse() }), 'Rotation saved') }, 'Save'))))));
  },

  async Blacklist(root) {
    const b = await api('/blacklist');
    const type = h('select', {}, h('option', { value: 'user' }, 'User'), h('option', { value: 'guild' }, 'Server'));
    const id = h('input', { type: 'text', placeholder: 'ID' });
    const reason = h('input', { type: 'text', placeholder: 'Reason' });
    const rows = (kind) => Object.entries(b[kind + 's']).map(([i, e]) => [h('span', { class: 'tag' }, kind), h('span', { class: 'mono' }, i), e.reason, fmtTime(e.at), h('button', { class: 'sm', onclick: () => act(() => api(`/blacklist/${kind}/${i}`, 'DELETE').then(render), 'Removed') }, 'Remove')]);
    root.replaceChildren(page(h('div', { class: 'stack' },
      card('Block a user or server', h('p', { class: 'muted' }, 'Blacklisted servers are left immediately, and automatically if the bot is re-invited.'), h('div', { class: 'row grow', style: 'margin:0' }, type, id, reason,
        h('button', { class: 'primary', onclick: () => act(() => api('/blacklist', 'POST', { type: type.value, id: id.value.trim(), reason: reason.value || undefined }).then(render), 'Blacklisted') }, 'Add'))),
      table(['Type', 'ID', 'Reason', 'Added', ''], [...rows('user'), ...rows('guild')]))));
  },

  async Commands(root) {
    const list = await api('/commands');
    root.replaceChildren(page(h('div', { class: 'row' }, h('button', { onclick: () => act(() => api('/commands/reload', 'POST').then(render), 'Reloaded') }, icon('refresh'), 'Hot-reload command files')),
      table(['Command', 'Access', 'Cooldown', 'Uses', 'Errors', 'State'], list.map((c) => [
        h('b', {}, '/' + c.name), h('span', { class: 'tag' }, c.level), c.cooldown ? c.cooldown + 's' : '-', fmtNum(c.uses), String(c.errors),
        c.level === 'owner' ? h('span', { class: 'muted' }, 'always on')
          : h('button', { class: 'sm ' + (c.disabled ? 'danger' : ''), onclick: () => act(() => api(`/commands/${c.name}/${c.disabled ? 'enable' : 'disable'}`, 'POST', { reason: 'Disabled from dashboard' }).then(render)) }, c.disabled ? 'Disabled — enable' : 'Enabled — disable'),
      ]))));
  },

  async Invite(root) {
    const r = await api('/invite?preset=' + (views.Invite.preset || 'minimal'));
    const sel = h('select', {}, r.presets.map((p) => h('option', { value: p.id, selected: p.id === (views.Invite.preset || 'minimal') }, p.label)));
    sel.addEventListener('change', () => { views.Invite.preset = sel.value; render(); });
    root.replaceChildren(page(card('Invite link generator', h('p', { class: 'muted' }, 'Share this link to add the bot to a server. Pick the narrowest permission set that works for you.'),
      h('div', { class: 'row' }, sel), h('div', { class: 'urlbox mono' }, r.url),
      h('div', { class: 'row', style: 'margin-top:12px' },
        h('button', { class: 'primary', onclick: () => navigator.clipboard.writeText(r.url).then(() => toast('Copied'), () => toast('Copy failed', true)) }, 'Copy link'),
        h('button', { onclick: () => window.open(r.url, '_blank', 'noopener') }, 'Open in browser')))));
  },

  async Logs(root) {
    const level = views.Logs.level || '';
    const entries = await api(`/logs?limit=400${level ? '&level=' + level : ''}`);
    const sel = h('select', {}, ['', 'debug', 'info', 'warn', 'error'].map((l) => h('option', { value: l, selected: l === level }, l || 'all levels')));
    sel.addEventListener('change', () => { views.Logs.level = sel.value; render(); });
    const box = h('div', { class: 'log' }, entries.map((e) => h('div', { class: e.level }, `${new Date(e.ts).toLocaleTimeString()}  ${e.level.toUpperCase().padEnd(5)} ${e.msg}`)));
    root.replaceChildren(page(h('div', { class: 'row' }, sel, h('span', { class: 'muted' }, 'Live — refreshes every 3 seconds')), box));
    box.scrollTop = box.scrollHeight;
    schedule(3000);
  },

  async Audit(root) {
    const rows = await api('/audit?limit=200');
    root.replaceChildren(page(table(['When', 'Actor', 'Action', 'Details'], rows.map((e) => [fmtTime(e.ts), h('span', { class: 'tag' }, e.actor), h('b', {}, e.action), e.details]))));
  },

  async Settings(root) {
    const [m, mgrs, backups] = await Promise.all([api('/maintenance'), api('/managers'), api('/backups')]);
    const reason = h('input', { type: 'text', placeholder: 'Message shown to users', value: m.reason, style: 'flex:1' });
    const mid = h('input', { type: 'text', placeholder: 'User ID' });
    const theme = h('select', {}, [['dark', 'Dark'], ['light', 'Light'], ['system', 'Match system']].map(([v, l]) => h('option', { value: v, selected: v === (localStorage.getItem('bm_theme') || 'dark') }, l)));
    theme.addEventListener('change', () => { localStorage.setItem('bm_theme', theme.value); applyAppearance(); });
    const cur = localStorage.getItem('bm_accent') || ACCENTS.Blurple;
    const swatches = h('div', { class: 'swatches' }, Object.entries(ACCENTS).map(([n, rgb]) => h('button', { class: 'swatch' + (rgb === cur ? ' on' : ''), title: n, style: `background:rgb(${rgb})`, onclick: () => { localStorage.setItem('bm_accent', rgb); applyAppearance(); render(); } })));
    const exportData = async () => {
      const res = await fetch('/api/export', { headers: { authorization: 'Bearer ' + token } });
      const url = URL.createObjectURL(await res.blob());
      const a = h('a', { href: url, download: 'veil-data.json' }); document.body.append(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    };
    const desk = shell ? card('Desktop app', h('div', { class: 'row' },
      h('button', { onclick: () => shell.openSettings() }, icon('settings'), 'Token & preferences'),
      h('button', { onclick: () => shell.openFolder('data') }, 'Open data folder'),
      h('button', { onclick: () => shell.openFolder('logs') }, 'Open logs folder'),
      h('button', { class: 'danger', onclick: confirmThen('Quit Veil?', 'This stops the bot and closes the app.', () => shell.quit(), 'Quit') }, 'Quit app'))) : null;
    root.replaceChildren(page(h('div', { class: 'stack' },
      h('div', { class: 'cols2' },
        card('Appearance', h('div', { class: 'row' }, theme), swatches),
        card(null,
          h('h3', {}, 'Maintenance mode ', h('span', { class: 'pill ' + (m.enabled ? 'warn' : 'ok') }, m.enabled ? 'ON' : 'off')),
          h('p', { class: 'muted' }, 'When on, only owners and managers can use the bot.'),
          h('div', { class: 'row' }, reason, h('button', { class: m.enabled ? '' : 'primary', onclick: () => act(() => api('/maintenance', 'PUT', { enabled: !m.enabled, reason: reason.value }).then(render), m.enabled ? 'Maintenance off' : 'Maintenance on') }, m.enabled ? 'Disable' : 'Enable')))),
      desk,
      card('Managers', h('p', { class: 'muted' }, 'Managers can use moderation-level commands but not destructive owner commands.'),
        h('div', { class: 'row' }, mid, h('button', { onclick: () => act(() => api('/managers', 'POST', { id: mid.value.trim() }).then(render), 'Added') }, 'Add manager')),
        mgrs.length ? table(['User ID', ''], mgrs.map((id) => [h('span', { class: 'mono' }, id), h('button', { class: 'sm', onclick: () => act(() => api('/managers/' + id, 'DELETE').then(render), 'Removed') }, 'Remove')])) : h('p', { class: 'muted' }, 'No managers.')),
      card('Backups', h('div', { class: 'row' }, h('button', { class: 'primary', onclick: () => act(() => api('/backups', 'POST').then(render), 'Backup created') }, 'Create backup now'), h('button', { onclick: () => act(exportData, 'Exported') }, 'Export data as JSON')),
        backups.length ? table(['File', 'Size', ''], backups.map((b) => [h('span', { class: 'mono' }, b.name), (b.size / 1024).toFixed(1) + ' KB', h('button', { class: 'sm danger', onclick: confirmThen('Restore backup?', 'This replaces your blacklist, settings and stats with the backup.', () => act(() => api('/backups/restore', 'POST', { name: b.name }).then(render), 'Restored'), 'Restore') }, 'Restore')])) : h('p', { class: 'muted' }, 'No backups yet.')),
      card('Process', h('div', { class: 'row' },
        h('button', { onclick: confirmThen('Restart the bot?', shell ? 'The bot process will restart.' : 'Needs the supervisor (npm start) to come back.', () => act(() => api('/restart', 'POST'), 'Restarting…'), 'Restart') }, icon('refresh'), 'Restart'),
        h('button', { class: 'danger', onclick: confirmThen('Shut the bot down?', 'It stays offline until started again.', () => act(() => api('/shutdown', 'POST'), 'Shutting down…'), 'Shut down') }, 'Shut down'))))));
  },
};

// ---------------------------------------------------------------- guild drawer
async function openGuild(id) {
  let g;
  try { g = await api('/guilds/' + id); } catch (e) { return toast(e.message, true); }
  const note = h('textarea', { placeholder: 'Private note (why you banned it, who to contact…)', maxlength: 500 }, g.note);
  const dl = (k, v) => [h('dt', {}, k), h('dd', {}, v)];
  overlay(h('div', { class: 'drawer' },
    h('h2', {}, g.icon ? h('img', { class: 'avatar', src: g.icon, alt: '' }) : null, g.name),
    h('dl', { class: 'kv' }, dl('ID', h('span', { class: 'mono' }, g.id)), dl('Members', fmtNum(g.memberCount)), dl('Owner', g.ownerTag ? `${g.ownerTag} (${g.ownerId})` : g.ownerId),
      dl('Created', fmtTime(g.createdAt)), dl('Bot joined', g.joinedAt ? fmtTime(g.joinedAt) : '-'), dl('Channels', `${g.channels} channels · ${g.roles} roles`),
      dl('Boost tier', String(g.boostTier)), dl('Commands used', fmtNum(g.commandsUsed)), dl('Features', g.features.join(', ') || 'none')),
    h('h3', {}, 'Notes'), note,
    h('div', { class: 'row', style: 'margin-top:10px' }, h('button', { onclick: () => act(() => api(`/guilds/${id}/note`, 'PUT', { note: note.value }), 'Note saved') }, 'Save note')),
    h('div', { class: 'row', style: 'margin-top:18px' },
      h('button', { class: 'danger', onclick: async () => { if (await ask('Leave ' + g.name + '?', 'The bot will leave this server.', 'Leave')) { await act(() => api(`/guilds/${id}/leave`, 'POST'), 'Left server'); closeLayer(); render(); } } }, 'Leave server'),
      h('button', { class: 'danger', onclick: async () => { if (await ask('Blacklist ' + g.name + '?', 'The bot leaves now and will auto-leave if re-invited.', 'Blacklist')) { await act(() => api('/blacklist', 'POST', { type: 'guild', id, reason: 'Blacklisted from dashboard' }), 'Blacklisted'); closeLayer(); render(); } } }, 'Blacklist & leave'),
      h('button', { class: 'ghost', onclick: closeLayer }, 'Close'))));
}

// ---------------------------------------------------------------- command palette
function openPalette() {
  const actions = [
    ...Object.keys(views).map((v) => ({ label: 'Go to ' + v, run: () => go(v) })),
    { label: 'Create backup now', run: () => act(() => api('/backups', 'POST'), 'Backup created') },
    { label: 'Hot-reload commands', run: () => act(() => api('/commands/reload', 'POST'), 'Reloaded') },
    { label: 'Toggle maintenance mode', run: async () => { const m = await api('/maintenance'); await act(() => api('/maintenance', 'PUT', { enabled: !m.enabled, reason: m.reason }), m.enabled ? 'Maintenance off' : 'Maintenance on'); render(); } },
    ...(shell ? [{ label: 'Restart bot', run: () => shell.restartBot() }, { label: 'Open settings', run: () => shell.openSettings() }] : []),
  ];
  let sel = 0, shown = actions;
  const list = h('div', { class: 'opts' });
  const input = h('input', { type: 'text', placeholder: 'Type a command…', autofocus: true });
  const draw = () => list.replaceChildren(...shown.map((a, i) => h('div', { class: 'opt' + (i === sel ? ' sel' : ''), onclick: () => run(a) }, a.label)));
  const run = (a) => { closeLayer(); a?.run(); };
  input.addEventListener('input', () => { const q = input.value.toLowerCase(); shown = actions.filter((a) => a.label.toLowerCase().includes(q)); sel = 0; draw(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { sel = Math.min(shown.length - 1, sel + 1); draw(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); draw(); e.preventDefault(); }
    else if (e.key === 'Enter') run(shown[sel]);
    else if (e.key === 'Escape') closeLayer();
  });
  overlay(h('div', { class: 'palette' }, input, list));
  draw();
  input.focus();
}
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && token) { e.preventDefault(); openPalette(); }
  else if (e.key === 'Escape') closeLayer();
});

// ---------------------------------------------------------------- shell
let current = 'Overview';

function setPill(s) {
  const p = $('#statusPill');
  p.textContent = s.maintenance.enabled ? 'Maintenance' : s.ready ? 'Online' : 'Connecting';
  p.className = 'pill ' + (s.maintenance.enabled ? 'warn' : s.ready ? 'ok' : 'bad');
}

function renderDesktopControls(state) {
  if (!shell) return;
  const running = ['starting', 'online', 'crashed'].includes(state.status);
  $('#desktopCtl').replaceChildren(
    h('button', { class: 'sm', title: running ? 'Stop bot' : 'Start bot', onclick: () => (running ? shell.stopBot() : shell.startBot()) }, icon(running ? 'stop' : 'play'), running ? 'Stop' : 'Start'),
    h('button', { class: 'sm', title: 'Restart bot', disabled: !running, onclick: () => shell.restartBot() }, icon('refresh'), 'Restart'),
    h('button', { class: 'sm', title: 'Settings', onclick: () => shell.openSettings() }, icon('settings')));
}

function schedule(ms) { clearTimeout(timer); timer = setTimeout(render, ms); }
function go(v) { current = v; render(); }

async function render() {
  clearTimeout(timer);
  $('#title').textContent = current;
  for (const b of document.querySelectorAll('#nav button')) b.classList.toggle('active', b.dataset.view === current);
  const root = $('#view');
  try { await views[current](root); } catch (e) { if (token) root.replaceChildren(page(h('p', { class: 'error' }, e.message))); }
}

function logout() {
  token = '';
  sessionStorage.removeItem('bm_token');
  clearTimeout(timer);
  $('#app').classList.add('hidden');
  $('#login').classList.remove('hidden');
}

function showApp() {
  $('#login').classList.add('hidden');
  $('#app').classList.remove('hidden');
  $('#nav').replaceChildren(...NAV.map((n) => (typeof n === 'string' ? h('div', { class: 'group' }, n.slice(1)) : h('button', { 'data-view': n[0], onclick: () => go(n[0]) }, icon(n[1]), n[0]))));
  if (shell) { shell.getStatus().then(renderDesktopControls); shell.onStatus(renderDesktopControls); $('#logout').classList.add('hidden'); }
  render();
}

$('#paletteBtn').addEventListener('click', openPalette);
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  token = $('#tokenInput').value.trim();
  try {
    await api('/overview');
    sessionStorage.setItem('bm_token', token);
    $('#loginError').textContent = '';
    showApp();
  } catch (err) {
    token = '';
    $('#loginError').textContent = err.message === 'Session expired' ? 'Invalid token.' : err.message;
  }
});
$('#logout').addEventListener('click', logout);

if (token) showApp(); else $('#login').classList.remove('hidden');
