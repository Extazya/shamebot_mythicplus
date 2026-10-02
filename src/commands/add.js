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
      .setDescription('Ajoute un joueur à la liste de suivi M+')
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
          `❌ Personnage **${input.name}** introuvable sur **${input.realm}** (${input.region.toUpperCase()}).\n> *Vérifiez l'orthographe du nom et du serveur.*`
        );
      }
      return interaction.editReply(`❌ Raider.io est indisponible pour le moment.\n> ${err.message}`);
    }

    const player = playerFromProfile(character, input);

    if (!addPlayer(interaction.guildId, player)) {
      return interaction.editReply(
        `⚠️ **${player.name}** (${player.realm}) est déjà dans la liste de suivi.`
      );
    }

    // An empty list still marks the player as initialized, so its very first run gets announced
    const runs = character.mythic_plus_recent_runs || [];
    initKnownRunIds(playerKey(player), runs.map(runId));

    const embed = buildProfileEmbed(player, character, runs.map(formatRun));
    await interaction.editReply({
      content: `✅ **${player.name}** ajouté au suivi M+ ! Les nouvelles runs seront annoncées automatiquement.`,
      embeds: [embed],
    });
  },
};
