const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { formatBytes } = require('../util');
const { eph } = require('../ui');

module.exports = {
  data: new SlashCommandBuilder().setName('stats').setDescription('Live bot statistics, usage and health.'),
  level: 'manager',
  async execute(interaction, { manager }) {
    const s = manager.stats();
    const top = Object.entries(s.usage).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n, c]) => `\`/${n}\` ${c.toLocaleString()}`).join('\n') || 'No usage yet';
    const today = s.daily[new Date().toISOString().slice(0, 10)] || { commands: 0, errors: 0, joins: 0, leaves: 0 };
    const embed = new EmbedBuilder()
      .setTitle('📊 Bot statistics')
      .setColor(s.maintenance.enabled ? 0xfee75c : 0x57f287)
      .addFields(
        { name: 'Uptime', value: s.uptime, inline: true },
        { name: 'Gateway ping', value: `${s.ping}ms`, inline: true },
        { name: 'Memory', value: `${formatBytes(s.memory.rss)} RSS`, inline: true },
        { name: 'Servers', value: s.guilds.toLocaleString(), inline: true },
        { name: 'Users (approx.)', value: s.users.toLocaleString(), inline: true },
        { name: 'Commands', value: String(s.commands), inline: true },
        { name: 'Today', value: `${today.commands} cmds · ${today.errors} errors · +${today.joins}/-${today.leaves} servers`, inline: false },
        { name: 'Top commands', value: top, inline: true },
        { name: 'Blacklist', value: `${s.blacklist.users} users · ${s.blacklist.guilds} servers`, inline: true },
      )
      .setFooter({ text: `Node ${s.node}${s.maintenance.enabled ? ' · MAINTENANCE ON' : ''}` });
    await interaction.reply({ embeds: [embed], flags: eph });
  },
};
