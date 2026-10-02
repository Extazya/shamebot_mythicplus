const { SlashCommandBuilder, InteractionContextType } = require('discord.js');
const { getRecentRuns, formatRun } = require('../raiderio');
const { buildRunEmbed, buildProfileEmbed } = require('../embeds');
const { addCharacterOptions, readCharacterOptions } = require('../options');
const { playerFromProfile } = require('../player');

module.exports = {
  data: addCharacterOptions(
    new SlashCommandBuilder()
      .setName('check')
      .setDescription('Affiche les dernières runs M+ d\'un joueur')
      .setContexts(InteractionContextType.Guild)
  )
    .addIntegerOption(opt =>
      opt.setName('nombre')
        .setDescription('Nombre de runs à afficher (1-5, défaut: 5)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(5)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const input = readCharacterOptions(interaction);
    const count = interaction.options.getInteger('nombre') || 5;

    let result;
    try {
      result = await getRecentRuns(input.region, input.realm, input.name);
    } catch (err) {
      return interaction.editReply(
        `❌ Impossible de récupérer les données de **${input.name}** (${input.realm} — ${input.region.toUpperCase()}).\n> ${err.message}`
      );
    }

    const { character, runs } = result;
    const player = playerFromProfile(character, input);

    if (runs.length === 0) {
      return interaction.editReply(
        `ℹ️ **${player.name}** n'a aucune run M+ enregistrée cette saison sur Raider.io.`
      );
    }

    const formattedRuns = runs.slice(0, count).map(formatRun);

    // One message: profile + up to 5 runs stays under Discord's 10-embed limit
    await interaction.editReply({
      embeds: [
        buildProfileEmbed(player, character, formattedRuns),
        ...formattedRuns.map(run => buildRunEmbed(player, run)),
      ],
    });
  },
};
