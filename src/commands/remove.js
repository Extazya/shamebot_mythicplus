const { SlashCommandBuilder } = require('discord.js');
const { removePlayer } = require('../db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Retire un joueur du suivi M+')
    .addStringOption(opt =>
      opt.setName('nom')
        .setDescription('Nom du personnage')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('serveur')
        .setDescription('Nom du serveur/realm')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('region')
        .setDescription('Région — défaut: eu')
        .setRequired(false)
        .addChoices(
          { name: '🇪🇺 EU', value: 'eu' },
          { name: '🇺🇸 US', value: 'us' },
          { name: '🇰🇷 KR', value: 'kr' },
          { name: '🇹🇼 TW', value: 'tw' },
        )
    ),

  async execute(interaction) {
    const name   = interaction.options.getString('nom');
    const realm  = interaction.options.getString('serveur');
    const region = interaction.options.getString('region') || 'eu';

    const removed = removePlayer(region, realm, name);

    if (!removed) {
      return interaction.reply({
        content: `⚠️ **${name}** (${realm}) n'est pas dans la liste de suivi.`,
        ephemeral: true,
      });
    }

    await interaction.reply(`🗑️ **${name}** (${realm} — ${region.toUpperCase()}) retiré du suivi.`);
  },
};
