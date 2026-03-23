const { SlashCommandBuilder } = require('discord.js');
const { getPlayers } = require('../db');
const { buildPlayerListEmbed } = require('../embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('list')
    .setDescription('Affiche la liste des joueurs suivis'),

  async execute(interaction) {
    const players = getPlayers();
    const embed = buildPlayerListEmbed(players);
    await interaction.reply({ embeds: [embed] });
  },
};
