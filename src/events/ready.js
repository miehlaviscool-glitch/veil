const { commandPayload } = require('../handlers');
const { deployCommands, hashPayload } = require('../services/deploy');

module.exports = {
  name: 'clientReady',
  once: true,
  async execute(ctx, client) {
    const { logger, manager, store, config } = ctx;
    logger.info(`Logged in as ${client.user.tag} in ${client.guilds.cache.size} guild(s).`);
    await manager.resolveAppOwners();
    logger.info(`Owners: ${[...new Set([...config.ownerIds, ...manager.appOwnerIds])].join(', ') || 'none configured!'}`);

    manager.startRotation();
    manager.startSchedules();
    process.send?.({ type: 'ready', tag: client.user.tag, id: client.user.id, guilds: client.guilds.cache.size });

    // Leave any guild that was blacklisted while the bot was offline.
    for (const id of Object.keys(store.data.blacklist.guilds)) {
      const g = client.guilds.cache.get(id);
      if (g) await g.leave().then(() => logger.warn(`Left blacklisted guild ${g.name} (${id})`)).catch(() => {});
    }

    if (config.autoDeploy) {
      const payload = commandPayload(client);
      const scope = config.devGuildId || 'global';
      const hash = hashPayload(payload, scope);
      if (store.data.deployHash !== hash) {
        try {
          const where = await deployCommands({ token: config.token, clientId: client.user.id, devGuildId: config.devGuildId }, payload);
          store.update((d) => { d.deployHash = hash; });
          logger.info(`Deployed ${payload.length} slash commands to ${where}.`);
        } catch (e) {
          logger.error('Command deploy failed:', e.message);
        }
      }
    }
    ctx.notifier.send('Bot online', `${client.user.tag} is up in ${client.guilds.cache.size} guilds.`, 0x57f287);
  },
};
