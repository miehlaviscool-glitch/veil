const { SlashCommandBuilder } = require('discord.js');
const util = require('util');
const { eph, code } = require('../ui');
const { redact } = require('../util');

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('eval')
    .setDescription('DANGEROUS: run JavaScript in the bot process (needs ENABLE_EVAL=true).')
    .addStringOption((o) => o.setName('code').setDescription('Code; use `return` to output a value').setRequired(true)),
  level: 'owner',
  async execute(interaction, ctx) {
    const { config, manager } = ctx;
    // Stricter than "owner": only IDs explicitly listed in OWNER_IDS, and only when the flag is on.
    if (!config.enableEval) return interaction.reply({ content: 'Eval is disabled. Set `ENABLE_EVAL=true` in `.env` to enable it.', flags: eph });
    if (!manager.isEnvOwner(interaction.user.id)) return interaction.reply({ content: 'Eval is limited to users listed in `OWNER_IDS`.', flags: eph });

    const source = interaction.options.getString('code', true);
    manager.audit(`discord:${interaction.user.id}`, 'eval', source.slice(0, 300));
    await interaction.deferReply({ flags: eph });
    const started = Date.now();
    try {
      const result = await new AsyncFunction('ctx', 'interaction', 'client', source)(ctx, interaction, ctx.client);
      const out = redact(typeof result === 'string' ? result : util.inspect(result, { depth: 1 }), [config.token, config.dashboard.token]);
      await interaction.editReply(`✅ ${Date.now() - started}ms\n${code(out, 'js')}`);
    } catch (e) {
      await interaction.editReply(`❌ ${code(redact(e.stack || e.message, [config.token]).slice(0, 1800), 'js')}`);
    }
  },
};
