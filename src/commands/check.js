const { SlashCommandBuilder } = require('discord.js');
const { getRecentRuns, formatRun } = require('../raiderio');
const { buildRunEmbed, buildProfileEmbed } = require('../embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('check')
    .setDescription('Affiche les dernières runs M+ d\'un joueur')
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

    const name   = interaction.options.getString('nom');
    const realm  = interaction.options.getString('serveur');
    const region = interaction.options.getString('region') || 'eu';
    const count  = interaction.options.getInteger('nombre') || 5;

    let result;
    try {
      result = await getRecentRuns(region, realm, name);
    } catch (err) {
      return interaction.editReply(
        `❌ Impossible de récupérer les données de **${name}** (${realm} — ${region.toUpperCase()}).\n> ${err.message}`
      );
    }

    const { character, runs } = result;

    if (!runs || runs.length === 0) {
      return interaction.editReply(
        `ℹ️ **${name}** n'a aucune run M+ enregistrée cette saison sur Raider.io.`
      );
    }

    const formattedRuns = runs.slice(0, count).map(formatRun);

    // Profil en premier message
    const profileEmbed = buildProfileEmbed({ region, realm, name }, character, formattedRuns);
    await interaction.editReply({ embeds: [profileEmbed] });

    // Puis chaque run dans un embed séparé (max 5 pour rester sous le rate limit Discord)
    const runsToShow = formattedRuns.slice(0, 5);
    for (const run of runsToShow) {
      const runEmbed = buildRunEmbed({ region, realm, name }, run);
      await interaction.followUp({ embeds: [runEmbed] });
    }
  },
};
