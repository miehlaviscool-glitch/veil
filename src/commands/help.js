const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { eph } = require('../ui');

const ICON = { public: '🌐', manager: '🛡️', owner: '👑' };

module.exports = {
  data: new SlashCommandBuilder().setName('help').setDescription('List the commands you can use.'),
  level: 'public',
  cooldown: 5,
  async execute(interaction, { manager, store, client }) {
    const mine = manager.listCommands().filter((c) => manager.hasLevel(interaction.user.id, c.level));
    const lines = mine.map((c) => `${ICON[c.level]} \`/${c.name}\` — ${c.description}${c.disabled ? ' *(disabled)*' : ''}`);
    const embed = new EmbedBuilder()
      .setTitle(`${client.user.username} commands`)
      .setDescription(lines.join('\n').slice(0, 4000))
      .setColor(0x5865f2)
      .setFooter({ text: `Access level: ${manager.getLevel(interaction.user.id)}` });
    if (store.data.maintenance.enabled) embed.addFields({ name: '🛠️ Maintenance', value: store.data.maintenance.reason || 'Enabled' });
    await interaction.reply({ embeds: [embed], flags: eph });
  },
};
