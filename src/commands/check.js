const { SlashCommandBuilder, InteractionContextType } = require('discord.js');
const { getRecentRuns, formatRun } = require('../raiderio');
const { buildRunEmbed, buildProfileEmbed } = require('../embeds');
const { addCharacterOptions, readCharacterOptions } = require('../options');
const { playerFromProfile } = require('../player');

module.exports = {
  data: addCharacterOptions(
    new SlashCommandBuilder()
      .setName('check')
      .setDescription('Show a character\'s latest M+ runs')
      .setContexts(InteractionContextType.Guild)
  )
    .addIntegerOption(opt =>
      opt.setName('count')
        .setDescription('Number of runs to show (1 to 5, default 5)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(5)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const input = readCharacterOptions(interaction);
    const count = interaction.options.getInteger('count') || 5;

    let result;
    try {
      result = await getRecentRuns(input.region, input.realm, input.name);
    } catch (err) {
      return interaction.editReply(
        `❌ Cannot fetch **${input.name}** (${input.realm}, ${input.region.toUpperCase()}).\n> ${err.message}`
      );
    }

    const { character, runs } = result;
    const player = playerFromProfile(character, input);

    if (runs.length === 0) {
      return interaction.editReply(
        `ℹ️ **${player.name}** has no M+ run this season on Raider.io.`
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
