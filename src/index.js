const path = require('path');
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const config = require('./config');
const { Logger } = require('./logger');
const { Store } = require('./store');
const { Notifier } = require('./services/notifier');
const { Manager } = require('./services/manager');
const { loadCommands, loadEvents } = require('./handlers');
const { startDashboard } = require('./dashboard/server');

const logger = new Logger({ dir: config.logDir, level: config.logLevel });

if (!config.token) {
  logger.error('DISCORD_TOKEN is missing. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const store = new Store(path.join(config.dataDir, 'data.json'));
const notifier = new Notifier(config.webhookUrl, logger);
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
  partials: [Partials.Channel],
  allowedMentions: { parse: [], repliedUser: false },
});

const manager = new Manager({ client, store, logger, config, notifier, loadCommands: (c) => loadCommands(c, logger) });
const ctx = { client, store, logger, config, notifier, manager };

logger.info(`Loaded ${loadCommands(client, logger)} commands.`);
loadEvents(client, ctx);

client.on('error', (e) => logger.error('Client error:', e));
client.on('warn', (m) => logger.warn('Client warning:', m));
client.on('shardDisconnect', (ev, id) => logger.warn(`Shard ${id} disconnected (code ${ev.code}).`));
client.on('shardReconnecting', (id) => logger.info(`Shard ${id} reconnecting...`));

process.on('unhandledRejection', (e) => {
  logger.error('Unhandled rejection:', e);
  notifier.send('Unhandled rejection', `\`\`\`${String(e?.stack || e).slice(0, 1800)}\`\`\``, 0xed4245);
});
process.on('uncaughtException', (e) => {
  logger.error('Uncaught exception:', e);
  store.flush();
  process.exit(1); // supervisor restarts us in a clean state
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    logger.info(`${sig} received, shutting down.`);
    store.flush();
    client.destroy();
    process.exit(0);
  });
}

process.on('message', (m) => {
  if (m?.type === 'shutdown') {
    logger.info('Shutdown requested by desktop app.');
    store.flush();
    client.destroy();
    process.exit(0);
  }
});

if (config.dashboard.enabled) startDashboard(ctx);

client.login(config.token).catch((e) => {
  logger.error('Login failed:', e.message);
  // Tell the desktop shell this is not worth retrying (bad/revoked token, disallowed intents...).
  if (process.send) process.send({ type: 'fatal', reason: e.message }, () => process.exit(1));
  else process.exit(1);
});
