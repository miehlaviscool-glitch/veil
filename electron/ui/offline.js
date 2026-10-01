'use strict';
const $ = (id) => document.getElementById(id);

const TEXT = {
  stopped: ['Bot is stopped', 'Press Start to bring your bot online.'],
  starting: ['Starting your bot…', 'Connecting to Discord.'],
  online: ['Online', 'Loading dashboard…'],
  crashed: ['The bot crashed', ''],
  error: ['Could not start the bot', ''],
};

function render(s) {
  const [title, detail] = TEXT[s.status] || TEXT.stopped;
  $('title').textContent = title;
  $('detail').textContent = s.reason || detail;
  $('dot').className = 'status-dot ' + s.status;
  $('start').classList.toggle('hidden', s.status !== 'stopped');
  $('restart').classList.toggle('hidden', !['error', 'crashed'].includes(s.status));
}

$('start').addEventListener('click', () => desktop.startBot());
$('restart').addEventListener('click', () => desktop.restartBot());
$('settings').addEventListener('click', () => desktop.openSettings());
$('logs').addEventListener('click', () => desktop.openFolder('logs'));
desktop.onStatus(render);
desktop.getStatus().then(render);
