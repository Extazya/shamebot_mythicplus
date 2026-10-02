const { SlashCommandBuilder, InteractionContextType } = require('discord.js');
const { addPlayer, initKnownRunIds } = require('../db');
const { getCharacterProfile, formatRun, runId } = require('../raiderio');
const { buildProfileEmbed } = require('../embeds');
const { addCharacterOptions, readCharacterOptions } = require('../options');
const { playerKey, playerFromProfile } = require('../player');

module.exports = {
  data: addCharacterOptions(
    new SlashCommandBuilder()
      .setName('add')
      .setDescription('Track a character\'s M+ runs')
      .setContexts(InteractionContextType.Guild)
  ),

  async execute(interaction) {
    await interaction.deferReply();

    const input = readCharacterOptions(interaction);

    let character;
    try {
      character = await getCharacterProfile(input.region, input.realm, input.name);
    } catch (err) {
      if (err.status === 400 || err.status === 404) {
        return interaction.editReply(
          `❌ Character **${input.name}** not found on **${input.realm}** (${input.region.toUpperCase()}).\n> *Check the character and realm spelling.*`
        );
      }
      return interaction.editReply(`❌ Raider.io is unavailable right now.\n> ${err.message}`);
    }

    const player = playerFromProfile(character, input);

    if (!addPlayer(interaction.guildId, player)) {
      return interaction.editReply(
        `⚠️ **${player.name}** (${player.realm}) is already tracked.`
      );
    }

    // An empty list still marks the player as initialized, so its very first run gets announced
    const runs = character.mythic_plus_recent_runs || [];
    initKnownRunIds(playerKey(player), runs.map(runId));

    const embed = buildProfileEmbed(player, character, runs.map(formatRun));
    await interaction.editReply({
      content: `✅ **${player.name}** is now tracked. New runs will be announced automatically.`,
      embeds: [embed],
    });
  },
};
