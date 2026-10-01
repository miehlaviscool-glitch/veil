const { SlashCommandBuilder } = require('discord.js');
const { confirm, eph } = require('../ui');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('broadcast')
    .setDescription('Send an announcement to every server (system channel or first writable channel).')
    .addStringOption((o) => o.setName('message').setDescription('Announcement text').setRequired(true).setMaxLength(1900))
    .addStringOption((o) => o.setName('target').setDescription('Where to send it').addChoices({ name: 'Server channels (default)', value: 'channels' }, { name: "Server owners' DMs", value: 'owners' }))
    .addBooleanOption((o) => o.setName('dry_run').setDescription('Only count reachable servers, send nothing')),
  level: 'owner',
  async execute(interaction, { manager, client }) {
    const message = interaction.options.getString('message', true);
    const target = interaction.options.getString('target') || 'channels';
    const dryRun = interaction.options.getBoolean('dry_run') ?? false;
    const actor = `discord:${interaction.user.id}`;

    if (!dryRun) {
      const ok = await confirm(interaction, `Send this to **${client.guilds.cache.size}** servers (${target})?\n>>> ${message}`);
      if (!ok) return;
    } else {
      await interaction.deferReply({ flags: eph });
    }
    const job = manager.startBroadcast(actor, { message, target, dryRun });
    const note = `📣 Broadcast \`${job.id}\` ${dryRun ? '(dry run) ' : ''}started for ${job.total} servers. It runs in the background (about 1s per server); progress is on the dashboard or in the logs.`;
    await interaction.editReply({ content: note, components: [] });
  },
};
