const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { eph } = require('../ui');

const type = (o) => o.setName('type').setDescription('What to blacklist').setRequired(true).addChoices({ name: 'User', value: 'user' }, { name: 'Server', value: 'guild' });

module.exports = {
  data: new SlashCommandBuilder()
    .setName('blacklist')
    .setDescription('Block abusive users or servers from using the bot.')
    .addSubcommand((s) => s.setName('add').setDescription('Blacklist a user or server (the bot leaves blacklisted servers).')
      .addStringOption(type)
      .addStringOption((o) => o.setName('id').setDescription('User or server ID').setRequired(true))
      .addStringOption((o) => o.setName('reason').setDescription('Reason').setMaxLength(200)))
    .addSubcommand((s) => s.setName('remove').setDescription('Remove an entry.')
      .addStringOption(type)
      .addStringOption((o) => o.setName('id').setDescription('User or server ID').setRequired(true)))
    .addSubcommand((s) => s.setName('list').setDescription('Show all blacklist entries.')),
  level: 'manager',
  async execute(interaction, { manager, store }) {
    const sub = interaction.options.getSubcommand();
    const actor = `discord:${interaction.user.id}`;
    try {
      if (sub === 'add') {
        const kind = interaction.options.getString('type', true);
        const id = interaction.options.getString('id', true).trim();
        // Only owners may blacklist servers (it makes the bot leave).
        if (kind === 'guild' && !manager.hasLevel(interaction.user.id, 'owner')) return interaction.reply({ content: 'Only owners can blacklist servers.', flags: eph });
        await manager.blacklistAdd(actor, kind, id, interaction.options.getString('reason') || undefined);
        return interaction.reply({ content: `🚫 Blacklisted ${kind} \`${id}\`.`, flags: eph });
      }
      if (sub === 'remove') {
        manager.blacklistRemove(actor, interaction.options.getString('type', true), interaction.options.getString('id', true).trim());
        return interaction.reply({ content: '✅ Removed from the blacklist.', flags: eph });
      }
      const fmt = (b, p) => Object.entries(b).slice(0, 20).map(([id, e]) => `${p} \`${id}\` — ${e.reason}`).join('\n') || 'None';
      const { users, guilds } = store.data.blacklist;
      await interaction.reply({
        embeds: [new EmbedBuilder().setTitle('Blacklist').setColor(0xed4245).addFields({ name: `Users (${Object.keys(users).length})`, value: fmt(users, '👤') }, { name: `Servers (${Object.keys(guilds).length})`, value: fmt(guilds, '🏠') })],
        flags: eph,
      });
    } catch (e) {
      await interaction.reply({ content: `❌ ${e.message}`, flags: eph });
    }
  },
};
