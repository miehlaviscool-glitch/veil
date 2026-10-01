const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { eph } = require('../ui');

const nameOpt = (o) => o.setName('name').setDescription('Command name').setRequired(true).setAutocomplete(true);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('commands')
    .setDescription('Enable, disable and reload bot commands without restarting.')
    .addSubcommand((s) => s.setName('list').setDescription('Show all commands with usage and state.'))
    .addSubcommand((s) => s.setName('disable').setDescription('Disable a command for non-owners.').addStringOption(nameOpt).addStringOption((o) => o.setName('reason').setDescription('Shown to users').setMaxLength(200)))
    .addSubcommand((s) => s.setName('enable').setDescription('Re-enable a command.').addStringOption(nameOpt))
    .addSubcommand((s) => s.setName('reload').setDescription('Hot-reload command files from disk.')),
  level: 'manager',
  async autocomplete(interaction, { manager }) {
    const q = interaction.options.getFocused().toLowerCase();
    await interaction.respond(manager.listCommands().filter((c) => c.name.includes(q)).slice(0, 25).map((c) => ({ name: c.name, value: c.name })));
  },
  async execute(interaction, { manager }) {
    const sub = interaction.options.getSubcommand();
    const actor = `discord:${interaction.user.id}`;
    try {
      if (sub === 'list') {
        const lines = manager.listCommands().map((c) => `${c.disabled ? '⛔' : '✅'} \`/${c.name}\` · ${c.level} · ${c.uses} uses${c.errors ? ` · ${c.errors} errors` : ''}`);
        return interaction.reply({ embeds: [new EmbedBuilder().setTitle('Commands').setDescription(lines.join('\n')).setColor(0x5865f2)], flags: eph });
      }
      if (sub === 'reload') {
        if (!manager.hasLevel(interaction.user.id, 'owner')) return interaction.reply({ content: 'Only owners can reload commands.', flags: eph });
        const n = await manager.reloadCommands(actor);
        return interaction.reply({ content: `🔄 Reloaded ${n} commands. (New/changed command *definitions* are re-registered on the next restart or via \`npm run deploy\`.)`, flags: eph });
      }
      const name = interaction.options.getString('name', true);
      manager.setCommandEnabled(actor, name, sub === 'enable', interaction.options.getString('reason') || '');
      await interaction.reply({ content: `✅ \`/${name}\` ${sub}d.`, flags: eph });
    } catch (e) {
      await interaction.reply({ content: `❌ ${e.message}`, flags: eph });
    }
  },
};
