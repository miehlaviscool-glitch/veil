// Manual slash-command registration: `npm run deploy`
const { Collection } = require('discord.js');
const config = require('../src/config');
const { loadCommands, commandPayload } = require('../src/handlers');
const { deployCommands } = require('../src/services/deploy');

(async () => {
  if (!config.token || !config.clientId) throw new Error('DISCORD_TOKEN and CLIENT_ID must be set in .env');
  const fake = { commands: new Collection() };
  loadCommands(fake);
  const payload = commandPayload(fake);
  const where = await deployCommands(config, payload);
  console.log(`Deployed ${payload.length} commands to ${where}.`);
})().catch((e) => { console.error(e.message); process.exit(1); });
