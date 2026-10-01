const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');

const eph = MessageFlags.Ephemeral;

/**
 * Asks the invoking user to confirm a risky action with buttons.
 * Returns true only on an explicit "Confirm" within 30 seconds.
 */
async function confirm(interaction, content) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('confirm').setLabel('Confirm').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
  );
  const msg = await interaction.reply({ content, components: [row], flags: eph, withResponse: true });
  const message = msg.resource?.message ?? msg;
  try {
    const click = await message.awaitMessageComponent({
      componentType: ComponentType.Button,
      time: 30_000,
      filter: (i) => i.user.id === interaction.user.id,
    });
    await click.update({ content: click.customId === 'confirm' ? '⏳ Working...' : 'Cancelled.', components: [] });
    return click.customId === 'confirm';
  } catch {
    await interaction.editReply({ content: 'Timed out — cancelled.', components: [] }).catch(() => {});
    return false;
  }
}

/** Wraps text in a code block that fits Discord's 2000 char limit. */
const code = (text, lang = '') => '```' + lang + '\n' + String(text).slice(-1900 + lang.length) + '\n```';

const ts = (ms) => `<t:${Math.floor(ms / 1000)}:R>`;

module.exports = { confirm, code, ts, eph };
