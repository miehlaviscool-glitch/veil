module.exports = {
  name: 'guildDelete',
  async execute({ logger, store, notifier, manager }, guild) {
    if (!guild.available) return; // outage, not a removal
    store.bump('leaves');
    manager.activity('leave', `Removed from ${guild.name}`);
    logger.info(`Removed from guild ${guild.name} (${guild.id}).`);
    notifier.send('Left a guild', `**${guild.name}** (\`${guild.id}\`)\nTotal guilds: ${guild.client.guilds.cache.size}`, 0xed4245);
  },
};
