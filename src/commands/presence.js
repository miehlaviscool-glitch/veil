const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { eph } = require('../ui');
const { ACTIVITY_TYPES, STATUSES } = require('../services/manager');

const types = Object.keys(ACTIVITY_TYPES).map((t) => ({ name: t, value: t }));
const typeOpt = (o) => o.setName('type').setDescription('Activity type').setRequired(true).addChoices(...types);
const textOpt = (o) => o.setName('text').setDescription('Text — supports {guilds} {users} {uptime} {ping} {commands}').setRequired(true).setMaxLength(128);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('presence')
    .setDescription('Control the bot status and rotating activities.')
    .addSubcommand((s) => s.setName('set').setDescription('Set a static presence.')
      .addStringOption(typeOpt).addStringOption(textOpt)
      .addStringOption((o) => o.setName('status').setDescription('Online status').addChoices(...STATUSES.map((x) => ({ name: x, value: x })))))
    .addSubcommand((s) => s.setName('rotation-add').setDescription('Add an activity to the rotation.').addStringOption(typeOpt).addStringOption(textOpt))
    .addSubcommand((s) => s.setName('rotation-remove').setDescription('Remove a rotation item.').addIntegerOption((o) => o.setName('number').setDescription('Item number from /presence list').setRequired(true).setMinValue(1)))
    .addSubcommand((s) => s.setName('rotation-toggle').setDescription('Enable/disable the rotation.')
      .addBooleanOption((o) => o.setName('enabled').setDescription('Rotate activities?').setRequired(true))
      .addIntegerOption((o) => o.setName('interval').setDescription('Seconds between changes (15-3600)').setMinValue(15).setMaxValue(3600)))
    .addSubcommand((s) => s.setName('list').setDescription('Show current presence and rotation.')),
  level: 'manager',
  async execute(interaction, { manager, store }) {
    const sub = interaction.options.getSubcommand();
    const actor = `discord:${interaction.user.id}`;
    const rot = store.data.presence.rotation;
    try {
      if (sub === 'set') {
        manager.setPresence(actor, { type: interaction.options.getString('type'), text: interaction.options.getString('text'), status: interaction.options.getString('status') || store.data.presence.current.status });
        manager.setRotation(actor, { enabled: false }); // a manual set overrides the rotation
        return interaction.reply({ content: '✅ Presence updated (rotation paused).', flags: eph });
      }
      if (sub === 'rotation-add') {
        manager.setRotation(actor, { items: [...rot.items, { type: interaction.options.getString('type'), text: interaction.options.getString('text') }] });
        return interaction.reply({ content: `✅ Added. Rotation now has ${store.data.presence.rotation.items.length} item(s).`, flags: eph });
      }
      if (sub === 'rotation-remove') {
        const n = interaction.options.getInteger('number') - 1;
        if (!rot.items[n]) return interaction.reply({ content: 'No item with that number.', flags: eph });
        manager.setRotation(actor, { items: rot.items.filter((_, i) => i !== n) });
        return interaction.reply({ content: '✅ Removed.', flags: eph });
      }
      if (sub === 'rotation-toggle') {
        manager.setRotation(actor, { enabled: interaction.options.getBoolean('enabled'), intervalSec: interaction.options.getInteger('interval') ?? undefined });
        return interaction.reply({ content: `✅ Rotation ${store.data.presence.rotation.enabled ? 'enabled' : 'disabled'}.`, flags: eph });
      }
      const cur = store.data.presence.current;
      await interaction.reply({
        embeds: [new EmbedBuilder().setTitle('Presence').setColor(0x5865f2).addFields(
          { name: 'Current', value: `${cur.status} · ${cur.type} ${cur.text || '(none)'}` },
          { name: `Rotation (${rot.enabled ? `on, every ${rot.intervalSec}s` : 'off'})`, value: rot.items.map((it, i) => `${i + 1}. ${it.type} ${it.text}`).join('\n') || 'Empty' },
        )],
        flags: eph,
      });
    } catch (e) {
      await interaction.reply({ content: `❌ ${e.message}`, flags: eph });
    }
  },
};
