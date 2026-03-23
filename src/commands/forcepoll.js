const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { checkAllPlayers } = require('../poller');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('forcepoll')
    .setDescription('Force la vérification immédiate des nouvelles runs pour tous les joueurs suivis')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    await checkAllPlayers(interaction.client);
    await interaction.editReply('✅ Vérification forcée terminée. Les nouvelles runs ont été annoncées si disponibles.');
  },
};
