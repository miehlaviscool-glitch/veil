const fs = require('fs');
const os = require('os');
const path = require('path');
const { Collection } = require('discord.js');
const { Store } = require('../src/store');
const { Logger } = require('../src/logger');
const { Manager } = require('../src/services/manager');
const { Notifier } = require('../src/services/notifier');
const { loadCommands } = require('../src/handlers');

function makeCtx({ ownerIds = ['111111111111111111'], guilds = [] } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bm-'));
  const logger = new Logger({ level: 'error' });
  const store = new Store(path.join(dir, 'data.json'));
  const left = [];
  const cache = new Collection(guilds.map((g) => [g.id, { ...g, leave: async () => { left.push(g.id); cache.delete(g.id); }, joinedTimestamp: g.joinedTimestamp ?? 1 }]));
  const client = {
    user: { id: '999999999999999999', tag: 'Bot#0001', setPresence() {} },
    guilds: { cache },
    channels: { cache: new Collection() },
    ws: { ping: 42 },
    uptime: 5000,
    isReady: () => true,
    commands: new Collection(),
  };
  const config = { ownerIds, enableEval: false, restartExitCode: 42, dashboard: { token: 'test-token-123' } };
  const notifier = new Notifier(null, logger);
  const loader = (c) => loadCommands(c, logger);
  const manager = new Manager({ client, store, logger, config, notifier, loadCommands: loader });
  loader(client);
  return { client, store, logger, config, notifier, manager, left, dir };
}

module.exports = { makeCtx };
