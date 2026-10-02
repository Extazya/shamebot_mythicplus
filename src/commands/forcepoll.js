const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType, MessageFlags } = require('discord.js');
const { checkAllPlayers } = require('../poller');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('forcepoll')
    .setDescription('Check every tracked character for new runs right now')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await checkAllPlayers(interaction.client);

    if (result.skipped) {
      return interaction.editReply('⏳ A check is already running, new runs will be announced when it ends.');
    }

    const lines = [
      `✅ Check done: ${result.players} character(s) checked, ${result.announced} new run(s) announced.`,
    ];
    if (result.errors > 0) {
      lines.push(`⚠️ ${result.errors} character(s) could not be checked, see the bot logs.`);
    }
    await interaction.editReply(lines.join('\n'));
  },
};
