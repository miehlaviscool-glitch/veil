const crypto = require('crypto');
const { REST, Routes } = require('discord.js');

/** Registers slash commands (guild-scoped if devGuildId is set, otherwise global). */
async function deployCommands({ token, clientId, devGuildId }, payload) {
  const rest = new REST({ version: '10' }).setToken(token);
  const route = devGuildId ? Routes.applicationGuildCommands(clientId, devGuildId) : Routes.applicationCommands(clientId);
  await rest.put(route, { body: payload });
  return devGuildId ? `guild ${devGuildId}` : 'global';
}

const hashPayload = (payload, scope) => crypto.createHash('sha1').update(JSON.stringify(payload) + scope).digest('hex');

module.exports = { deployCommands, hashPayload };
