const { SlashCommandBuilder, EmbedBuilder, ChannelType } = require('discord.js');
const { eph, ts } = require('../ui');

const idOpt = (o) => o.setName('id').setDescription('Schedule ID').setRequired(true).setAutocomplete(true);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('schedule')
    .setDescription('Schedule one-off or repeating messages.')
    .addSubcommand((s) => s.setName('add').setDescription('Create a scheduled message.')
      .addStringOption((o) => o.setName('message').setDescription('Message text').setRequired(true).setMaxLength(1900))
      .addChannelOption((o) => o.setName('channel').setDescription('Where to post (omit to broadcast to all servers)').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
      .addIntegerOption((o) => o.setName('in_minutes').setDescription('Run first in N minutes (default: 1)').setMinValue(1).setMaxValue(525600))
      .addIntegerOption((o) => o.setName('every_minutes').setDescription('Then repeat every N minutes').setMinValue(1).setMaxValue(43200))
      .addStringOption((o) => o.setName('name').setDescription('Label').setMaxLength(60)))
    .addSubcommand((s) => s.setName('list').setDescription('Show schedules.'))
    .addSubcommand((s) => s.setName('toggle').setDescription('Pause or resume a schedule.').addStringOption(idOpt))
    .addSubcommand((s) => s.setName('run').setDescription('Run a schedule right now.').addStringOption(idOpt))
    .addSubcommand((s) => s.setName('remove').setDescription('Delete a schedule.').addStringOption(idOpt)),
  level: 'manager',
  async autocomplete(interaction, { store }) {
    await interaction.respond(store.data.schedules.slice(0, 25).map((s) => ({ name: `${s.id} — ${s.name}`.slice(0, 100), value: s.id })));
  },
  async execute(interaction, { manager, store }) {
    const sub = interaction.options.getSubcommand();
    const actor = `discord:${interaction.user.id}`;
    try {
      if (sub === 'list') {
        const rows = store.data.schedules.map((s) => `${s.enabled ? '🟢' : '⏸️'} \`${s.id}\` **${s.name}** → ${s.target.type === 'broadcast' ? 'all servers' : `<#${s.target.channelId}>`} · ${s.nextRun ? `next ${ts(s.nextRun)}` : 'done'}${s.everySec ? ` · every ${Math.round(s.everySec / 60)}m` : ''} · ${s.runs} runs`);
        return interaction.reply({ embeds: [new EmbedBuilder().setTitle('Schedules').setDescription(rows.join('\n') || 'None yet.').setColor(0x5865f2)], flags: eph });
      }
      if (sub === 'add') {
        const channel = interaction.options.getChannel('channel');
        const every = interaction.options.getInteger('every_minutes');
        const s = manager.addSchedule(actor, {
          name: interaction.options.getString('name') || undefined,
          message: interaction.options.getString('message', true),
          channelId: channel?.id,
          broadcast: !channel,
          at: Date.now() + (interaction.options.getInteger('in_minutes') || 1) * 60_000,
          everySec: every ? every * 60 : undefined,
        });
        return interaction.reply({ content: `⏰ Scheduled \`${s.id}\` — first run ${ts(s.nextRun)}.`, flags: eph });
      }
      const id = interaction.options.getString('id', true);
      if (sub === 'toggle') { manager.toggleSchedule(actor, id); return interaction.reply({ content: '✅ Toggled.', flags: eph }); }
      if (sub === 'remove') { manager.removeSchedule(actor, id); return interaction.reply({ content: '🗑️ Removed.', flags: eph }); }
      await interaction.deferReply({ flags: eph });
      await interaction.editReply(`▶️ Result: ${await manager.runScheduleNow(actor, id)}`);
    } catch (e) {
      const payload = { content: `❌ ${e.message}`, flags: eph };
      await (interaction.deferred || interaction.replied ? interaction.editReply({ content: payload.content }) : interaction.reply(payload));
    }
  },
};
