'use strict';
const $ = (id) => document.getElementById(id);
const first = new URLSearchParams(location.search).get('first') === '1';
let verified = null;

function say(el, text, kind) { el.textContent = text; el.className = 'msg ' + (kind || ''); }

async function init() {
  const s = await desktop.getSettings();
  $('owners').value = s.ownerIds;
  $('dev').value = s.devGuildId;
  $('hook').value = s.webhookUrl;
  for (const k of ['autoStartBot', 'minimizeToTray', 'notifications', 'launchAtLogin', 'autoDeploy']) $(k).checked = !!s[k];
  if (!first) {
    $('heading').textContent = 'Settings';
    $('sub').textContent = 'Changes apply when you save; the bot restarts automatically.';
    $('save').textContent = 'Save & restart bot';
    $('cancel').classList.remove('hidden');
    if (s.hasToken) $('tokenHint').textContent = '— stored securely; leave blank to keep it';
  }
}

$('verify').addEventListener('click', async () => {
  const token = $('token').value.trim();
  if (!token) return say($('tokenMsg'), 'Paste a token first.', 'err');
  say($('tokenMsg'), 'Checking with Discord…');
  $('verify').disabled = true;
  const r = await desktop.validateToken(token);
  $('verify').disabled = false;
  if (!r.ok) { verified = null; $('botcard').classList.add('hidden'); return say($('tokenMsg'), r.error, 'err'); }
  verified = r;
  say($('tokenMsg'), 'Token is valid.', 'ok');
  $('botName').textContent = r.username;
  $('botOwner').textContent = r.owner ? `Owned by ${r.owner}` : 'Ready to connect';
  if (r.avatar) { $('botAvatar').src = r.avatar; $('botAvatar').classList.remove('hidden'); } else $('botAvatar').classList.add('hidden');
  $('botcard').classList.remove('hidden');
});

$('save').addEventListener('click', async () => {
  $('save').disabled = true;
  say($('saveMsg'), 'Saving…');
  const r = await desktop.saveSettings({
    token: $('token').value,
    ownerIds: $('owners').value,
    devGuildId: $('dev').value,
    webhookUrl: $('hook').value,
    ...Object.fromEntries(['autoStartBot', 'minimizeToTray', 'notifications', 'launchAtLogin', 'autoDeploy'].map((k) => [k, $(k).checked])),
  });
  $('save').disabled = false;
  if (!r.ok) say($('saveMsg'), r.error, 'err');
});

$('cancel').addEventListener('click', () => desktop.closeWindow());
init();
