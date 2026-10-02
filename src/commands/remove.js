const { SlashCommandBuilder, InteractionContextType, MessageFlags } = require('discord.js');
const { removePlayer } = require('../db');
const { addCharacterOptions, readCharacterOptions } = require('../options');

module.exports = {
  data: addCharacterOptions(
    new SlashCommandBuilder()
      .setName('remove')
      .setDescription('Retire un joueur du suivi M+')
      .setContexts(InteractionContextType.Guild)
  ),

  async execute(interaction) {
    const input = readCharacterOptions(interaction);
    const removed = removePlayer(interaction.guildId, input);

    if (!removed) {
      return interaction.reply({
        content: `⚠️ **${input.name}** (${input.realm}) n'est pas dans la liste de suivi.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.reply(
      `🗑️ **${removed.name}** (${removed.realm} — ${removed.region.toUpperCase()}) retiré du suivi.`
    );
  },
};
