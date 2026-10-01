const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder().setName('ping').setDescription('Check the bot latency.'),
  level: 'public',
  cooldown: 5,
  async execute(interaction) {
    const sent = await interaction.reply({ content: 'Pinging...', withResponse: true });
    const msg = sent.resource?.message ?? sent;
    const roundtrip = msg.createdTimestamp - interaction.createdTimestamp;
    await interaction.editReply(`🏓 Pong! Round trip **${roundtrip}ms** · Gateway **${interaction.client.ws.ping}ms**`);
  },
};
