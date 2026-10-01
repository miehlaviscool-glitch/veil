const { SlashCommandBuilder } = require('discord.js');
const { eph } = require('../ui');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('managers')
    .setDescription('Grant trusted people limited bot-management access.')
    .addSubcommand((s) => s.setName('add').setDescription('Add a manager.').addUserOption((o) => o.setName('user').setDescription('User').setRequired(true)))
    .addSubcommand((s) => s.setName('remove').setDescription('Remove a manager.').addUserOption((o) => o.setName('user').setDescription('User').setRequired(true)))
    .addSubcommand((s) => s.setName('list').setDescription('List managers.')),
  level: 'owner',
  async execute(interaction, { manager, store }) {
    const sub = interaction.options.getSubcommand();
    const actor = `discord:${interaction.user.id}`;
    try {
      if (sub === 'list') {
        const m = store.data.managers;
        return interaction.reply({ content: m.length ? m.map((id) => `• <@${id}> (\`${id}\`)`).join('\n') : 'No managers.', flags: eph });
      }
      const user = interaction.options.getUser('user', true);
      if (sub === 'add') manager.addManager(actor, user.id);
      else manager.removeManager(actor, user.id);
      await interaction.reply({ content: `✅ ${user.tag} ${sub === 'add' ? 'is now a manager' : 'is no longer a manager'}.`, flags: eph });
    } catch (e) {
      await interaction.reply({ content: `❌ ${e.message}`, flags: eph });
    }
  },
};
