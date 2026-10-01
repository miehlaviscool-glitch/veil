const crypto = require('crypto');
const { MessageFlags } = require('discord.js');
const { formatDuration } = require('../util');

const cooldowns = new Map(); // `${user}:${command}` -> expiry ms
const deny = (interaction, content) => interaction.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => {});

module.exports = {
  name: 'interactionCreate',
  async execute(ctx, interaction) {
    const { client, manager, store, logger } = ctx;

    if (interaction.isAutocomplete()) {
      const cmd = client.commands.get(interaction.commandName);
      if (cmd?.autocomplete) await cmd.autocomplete(interaction, ctx).catch(() => interaction.respond([]).catch(() => {}));
      return;
    }
    if (!interaction.isChatInputCommand()) return;

    const cmd = client.commands.get(interaction.commandName);
    if (!cmd) return deny(interaction, 'That command no longer exists.');

    const userId = interaction.user.id;
    const level = manager.getLevel(userId);
    const isOwner = level === 'owner';

    // Gate checks (owners bypass everything except the permission level itself).
    if (!manager.hasLevel(userId, cmd.level)) return deny(interaction, `This command requires **${cmd.level}** access.`);

    if (!isOwner) {
      const ub = manager.isBlacklisted('user', userId);
      if (ub) return deny(interaction, `You are blocked from using this bot. Reason: ${ub.reason}`);
      const gb = interaction.guildId && manager.isBlacklisted('guild', interaction.guildId);
      if (gb) return deny(interaction, 'This server is blocked from using this bot.');
      const m = store.data.maintenance;
      if (m.enabled && level === 'public') return deny(interaction, `🛠️ The bot is in maintenance mode.${m.reason ? ` ${m.reason}` : ''}`);
      const off = store.data.disabledCommands[cmd.data.name];
      if (off) return deny(interaction, `This command is temporarily disabled.${off.reason ? ` ${off.reason}` : ''}`);
      if (cmd.guildOnly && !interaction.inGuild()) return deny(interaction, 'This command can only be used in a server.');

      if (cmd.cooldown) {
        const key = `${userId}:${cmd.data.name}`;
        const left = (cooldowns.get(key) || 0) - Date.now();
        if (left > 0) return deny(interaction, `⏳ Slow down! Try again in ${formatDuration(left)}.`);
        cooldowns.set(key, Date.now() + cmd.cooldown * 1000);
      }
    }

    store.update((d) => { d.stats.commandUsage[cmd.data.name] = (d.stats.commandUsage[cmd.data.name] || 0) + 1; });
    if (interaction.guildId) store.update((d) => { d.stats.guildUsage[interaction.guildId] = (d.stats.guildUsage[interaction.guildId] || 0) + 1; });
    store.bump('commands');
    logger.debug(`/${cmd.data.name} by ${interaction.user.tag} in ${interaction.guild?.name ?? 'DM'}`);

    try {
      await cmd.execute(interaction, ctx);
    } catch (e) {
      const errorId = crypto.randomBytes(3).toString('hex');
      store.update((d) => { d.stats.commandErrors[cmd.data.name] = (d.stats.commandErrors[cmd.data.name] || 0) + 1; });
      store.bump('errors');
      manager.activity('error', `/${cmd.data.name} failed [${errorId}]: ${String(e.message).slice(0, 120)}`);
      logger.error(`[${errorId}] /${cmd.data.name} failed:`, e);
      ctx.notifier.send(`Command error [${errorId}]`, `/${cmd.data.name}\n\`\`\`${String(e.stack || e).slice(0, 1500)}\`\`\``, 0xed4245);
      const msg = { content: `❌ Something went wrong. Error ID: \`${errorId}\``, flags: MessageFlags.Ephemeral };
      await (interaction.deferred || interaction.replied ? interaction.followUp(msg) : interaction.reply(msg)).catch(() => {});
    }
  },
};
