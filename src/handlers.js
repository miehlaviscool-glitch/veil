const fs = require('fs');
const path = require('path');
const { Collection } = require('discord.js');

const commandsDir = path.join(__dirname, 'commands');
const eventsDir = path.join(__dirname, 'events');

/** (Re)loads every command module. Bad modules are skipped and reported, never fatal. */
function loadCommands(client, logger = console) {
  const fresh = new Collection();
  for (const file of fs.readdirSync(commandsDir).filter((f) => f.endsWith('.js'))) {
    const full = path.join(commandsDir, file);
    try {
      delete require.cache[require.resolve(full)];
      const cmd = require(full);
      if (!cmd.data || typeof cmd.execute !== 'function') throw new Error('missing "data" or "execute"');
      cmd.level = cmd.level || 'public';
      fresh.set(cmd.data.name, cmd);
    } catch (e) {
      logger.error(`Failed to load command ${file}: ${e.message}`);
    }
  }
  client.commands = fresh;
  return fresh.size;
}

function loadEvents(client, ctx) {
  for (const file of fs.readdirSync(eventsDir).filter((f) => f.endsWith('.js'))) {
    const ev = require(path.join(eventsDir, file));
    const run = async (...args) => {
      try { await ev.execute(ctx, ...args); } catch (e) { ctx.logger.error(`Event ${ev.name} failed:`, e); }
    };
    ev.once ? client.once(ev.name, run) : client.on(ev.name, run);
  }
}

/** JSON for slash-command registration. */
const commandPayload = (client) => [...client.commands.values()].map((c) => c.data.toJSON());

module.exports = { loadCommands, loadEvents, commandPayload };
