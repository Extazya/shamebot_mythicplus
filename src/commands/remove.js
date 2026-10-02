const { SlashCommandBuilder, InteractionContextType, MessageFlags } = require('discord.js');
const { removePlayer } = require('../db');
const { addCharacterOptions, readCharacterOptions } = require('../options');

module.exports = {
  data: addCharacterOptions(
    new SlashCommandBuilder()
      .setName('remove')
      .setDescription('Stop tracking a character')
      .setContexts(InteractionContextType.Guild)
  ),

  async execute(interaction) {
    const input = readCharacterOptions(interaction);
    const removed = removePlayer(interaction.guildId, input);

    if (!removed) {
      return interaction.reply({
        content: `⚠️ **${input.name}** (${input.realm}) is not tracked.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.reply(
      `🗑️ **${removed.name}** (${removed.realm}, ${removed.region.toUpperCase()}) is no longer tracked.`
    );
  },
};
