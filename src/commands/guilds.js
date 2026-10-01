const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { confirm, ts, eph } = require('../ui');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('guilds')
    .setDescription('Inspect and manage the servers the bot is in.')
    .addSubcommand((s) => s.setName('list').setDescription('List servers.')
      .addStringOption((o) => o.setName('search').setDescription('Filter by name or ID'))
      .addStringOption((o) => o.setName('sort').setDescription('Sort order').addChoices(
        { name: 'Most members', value: 'members' }, { name: 'Name', value: 'name' }, { name: 'Newest joined', value: 'newest' }, { name: 'Oldest joined', value: 'oldest' }))
      .addIntegerOption((o) => o.setName('page').setDescription('Page number').setMinValue(1)))
    .addSubcommand((s) => s.setName('info').setDescription('Details about one server.')
      .addStringOption((o) => o.setName('id').setDescription('Server ID').setRequired(true).setAutocomplete(true)))
    .addSubcommand((s) => s.setName('leave').setDescription('Make the bot leave a server.')
      .addStringOption((o) => o.setName('id').setDescription('Server ID').setRequired(true).setAutocomplete(true))
      .addStringOption((o) => o.setName('reason').setDescription('Reason for the audit log'))),
  level: 'owner',
  async autocomplete(interaction, { manager }) {
    const q = interaction.options.getFocused();
    const { guilds } = manager.listGuilds({ q, perPage: 25 });
    await interaction.respond(guilds.map((g) => ({ name: `${g.name} (${g.memberCount})`.slice(0, 100), value: g.id })));
  },
  async execute(interaction, { manager, client }) {
    const sub = interaction.options.getSubcommand();
    const actor = `discord:${interaction.user.id}`;

    if (sub === 'list') {
      const r = manager.listGuilds({
        q: interaction.options.getString('search') || '',
        sort: interaction.options.getString('sort') || 'members',
        page: interaction.options.getInteger('page') || 1,
        perPage: 15,
      });
      const lines = r.guilds.map((g) => `${g.blacklisted ? '🚫' : '•'} **${g.name}** — ${g.memberCount.toLocaleString()} members · \`${g.id}\``);
      return interaction.reply({
        embeds: [new EmbedBuilder().setTitle(`Servers (${r.total})`).setDescription(lines.join('\n') || 'No matching servers.').setColor(0x5865f2).setFooter({ text: `Page ${r.page}/${r.pages}` })],
        flags: eph,
      });
    }

    const id = interaction.options.getString('id', true);
    const guild = client.guilds.cache.get(id);
    if (!guild) return interaction.reply({ content: 'The bot is not in a server with that ID.', flags: eph });

    if (sub === 'info') {
      const owner = await guild.fetchOwner().catch(() => null);
      const embed = new EmbedBuilder()
        .setTitle(guild.name)
        .setThumbnail(guild.iconURL())
        .setColor(0x5865f2)
        .addFields(
          { name: 'ID', value: guild.id, inline: true },
          { name: 'Members', value: guild.memberCount.toLocaleString(), inline: true },
          { name: 'Owner', value: owner ? `${owner.user.tag} (\`${owner.id}\`)` : `\`${guild.ownerId}\``, inline: false },
          { name: 'Created', value: ts(guild.createdTimestamp), inline: true },
          { name: 'Bot joined', value: ts(guild.joinedTimestamp), inline: true },
          { name: 'Channels / Roles', value: `${guild.channels.cache.size} / ${guild.roles.cache.size}`, inline: true },
          { name: 'Boost tier', value: String(guild.premiumTier), inline: true },
          { name: 'Features', value: guild.features.slice(0, 8).join(', ') || 'none', inline: false },
        );
      return interaction.reply({ embeds: [embed], flags: eph });
    }

    if (sub === 'leave') {
      const ok = await confirm(interaction, `Leave **${guild.name}** (\`${guild.id}\`, ${guild.memberCount} members)?`);
      if (!ok) return;
      const name = await manager.leaveGuild(actor, id, interaction.options.getString('reason') || '');
      await interaction.editReply({ content: `✅ Left **${name}**.`, components: [] });
    }
  },
};
