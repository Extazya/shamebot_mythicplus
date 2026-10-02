const { SlashCommandBuilder, InteractionContextType } = require('discord.js');
const { getPlayers } = require('../db');
const { buildPlayerListEmbed } = require('../embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('list')
    .setDescription('List the characters tracked on this server')
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    const embed = buildPlayerListEmbed(getPlayers(interaction.guildId));
    await interaction.reply({ embeds: [embed] });
  },
};
