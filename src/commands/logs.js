const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { eph, code } = require('../ui');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('logs')
    .setDescription('View recent bot logs.')
    .addIntegerOption((o) => o.setName('lines').setDescription('How many lines (default 20)').setMinValue(1).setMaxValue(200))
    .addStringOption((o) => o.setName('level').setDescription('Minimum level').addChoices(
      { name: 'debug', value: 'debug' }, { name: 'info', value: 'info' }, { name: 'warn', value: 'warn' }, { name: 'error', value: 'error' })),
  level: 'owner',
  async execute(interaction, { logger }) {
    const entries = logger.tail({ limit: interaction.options.getInteger('lines') || 20, level: interaction.options.getString('level') || undefined });
    if (!entries.length) return interaction.reply({ content: 'No log entries.', flags: eph });
    const text = entries.map((e) => `${new Date(e.ts).toISOString().slice(11, 19)} ${e.level.toUpperCase().padEnd(5)} ${e.msg}`).join('\n');
    if (text.length < 1850) return interaction.reply({ content: code(text), flags: eph });
    await interaction.reply({ files: [new AttachmentBuilder(Buffer.from(text), { name: 'logs.txt' })], flags: eph });
  },
};
