const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType, MessageFlags } = require('discord.js');
const { checkAllPlayers } = require('../poller');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('forcepoll')
    .setDescription('Force la vérification immédiate des nouvelles runs pour tous les joueurs suivis')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await checkAllPlayers(interaction.client);

    if (result.skipped) {
      return interaction.editReply('⏳ Une vérification est déjà en cours, les nouvelles runs seront annoncées à la fin de celle-ci.');
    }

    const lines = [
      `✅ Vérification terminée : ${result.players} joueur(s) vérifié(s), ${result.announced} nouvelle(s) run(s) annoncée(s).`,
    ];
    if (result.errors > 0) {
      lines.push(`⚠️ ${result.errors} joueur(s) n'ont pas pu être vérifiés (voir les logs du bot).`);
    }
    await interaction.editReply(lines.join('\n'));
  },
};
