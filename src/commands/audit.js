const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { eph, ts } = require('../ui');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('audit')
    .setDescription('Who did what: recent management actions.')
    .addIntegerOption((o) => o.setName('count').setDescription('Entries to show (default 15)').setMinValue(1).setMaxValue(25)),
  level: 'owner',
  async execute(interaction, { store }) {
    const n = interaction.options.getInteger('count') || 15;
    const rows = store.data.audit.slice(-n).reverse().map((e) => `${ts(e.ts)} \`${e.action}\` by ${e.actor.startsWith('discord:') ? `<@${e.actor.slice(8)}>` : e.actor}${e.details ? ` — ${e.details.slice(0, 80)}` : ''}`);
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle('Audit log').setDescription(rows.join('\n').slice(0, 4000) || 'Nothing yet.').setColor(0xfee75c)], flags: eph });
  },
};
