const { SlashCommandBuilder } = require('discord.js');
const { eph } = require('../ui');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('maintenance')
    .setDescription('Toggle maintenance mode (only owners and managers can use the bot).')
    .addBooleanOption((o) => o.setName('enabled').setDescription('Turn maintenance on or off').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Message shown to users').setMaxLength(300)),
  level: 'manager',
  async execute(interaction, { manager }) {
    const enabled = interaction.options.getBoolean('enabled', true);
    manager.setMaintenance(`discord:${interaction.user.id}`, enabled, interaction.options.getString('reason') || '');
    await interaction.reply({ content: enabled ? '🛠️ Maintenance mode **enabled**.' : '✅ Maintenance mode **disabled**.', flags: eph });
  },
};
