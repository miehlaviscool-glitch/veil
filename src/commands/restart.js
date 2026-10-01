const { SlashCommandBuilder } = require('discord.js');
const { confirm } = require('../ui');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('restart')
    .setDescription('Restart or shut down the bot process.')
    .addStringOption((o) => o.setName('action').setDescription('What to do').setRequired(true).addChoices({ name: 'Restart', value: 'restart' }, { name: 'Shut down', value: 'shutdown' })),
  level: 'owner',
  async execute(interaction, { manager }) {
    const action = interaction.options.getString('action', true);
    const note = action === 'restart' ? 'Restart requires the supervisor (`npm start`).' : 'The bot will stay offline until started manually.';
    if (!(await confirm(interaction, `${action === 'restart' ? 'Restart' : 'Shut down'} the bot? ${note}`))) return;
    await interaction.editReply({ content: action === 'restart' ? '🔄 Restarting...' : '👋 Shutting down...', components: [] });
    manager[action](`discord:${interaction.user.id}`);
  },
};
