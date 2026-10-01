const { SlashCommandBuilder } = require('discord.js');
const { eph, confirm } = require('../ui');
const { formatBytes } = require('../util');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('backup')
    .setDescription('Back up and restore the bot configuration data.')
    .addSubcommand((s) => s.setName('create').setDescription('Create a backup now.'))
    .addSubcommand((s) => s.setName('list').setDescription('List backups.'))
    .addSubcommand((s) => s.setName('restore').setDescription('Restore a backup.').addStringOption((o) => o.setName('name').setDescription('Backup file name').setRequired(true).setAutocomplete(true))),
  level: 'owner',
  async autocomplete(interaction, { store }) {
    await interaction.respond(store.listBackups().slice(0, 25).map((b) => ({ name: b.name, value: b.name })));
  },
  async execute(interaction, { manager, store }) {
    const sub = interaction.options.getSubcommand();
    const actor = `discord:${interaction.user.id}`;
    try {
      if (sub === 'create') return interaction.reply({ content: `💾 Backup created: \`${manager.backup(actor)}\``, flags: eph });
      if (sub === 'list') {
        const list = store.listBackups();
        return interaction.reply({ content: list.length ? list.slice(0, 20).map((b) => `\`${b.name}\` (${formatBytes(b.size)})`).join('\n') : 'No backups yet.', flags: eph });
      }
      const name = interaction.options.getString('name', true);
      if (!(await confirm(interaction, `Restore \`${name}\`? This replaces blacklist, settings and stats.`))) return;
      manager.restoreBackup(actor, name);
      await interaction.editReply({ content: '✅ Restored.', components: [] });
    } catch (e) {
      const payload = { content: `❌ ${e.message}`, flags: eph, components: [] };
      await (interaction.replied || interaction.deferred ? interaction.editReply(payload) : interaction.reply(payload));
    }
  },
};
