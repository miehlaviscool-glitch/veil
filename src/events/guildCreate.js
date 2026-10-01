module.exports = {
  name: 'guildCreate',
  async execute({ logger, manager, store, notifier }, guild) {
    if (manager.isBlacklisted('guild', guild.id)) {
      logger.warn(`Joined blacklisted guild ${guild.name} (${guild.id}); leaving.`);
      return guild.leave();
    }
    store.bump('joins');
    manager.activity('join', `Joined ${guild.name} (${guild.memberCount} members)`);
    logger.info(`Joined guild ${guild.name} (${guild.id}) with ${guild.memberCount} members.`);
    notifier.send('Joined a guild', `**${guild.name}** (\`${guild.id}\`)\nMembers: ${guild.memberCount}\nOwner: <@${guild.ownerId}>\nTotal guilds: ${guild.client.guilds.cache.size}`, 0x57f287);
  },
};
