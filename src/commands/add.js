const { SlashCommandBuilder } = require('discord.js');
const { addPlayer } = require('../db');
const { getCharacterProfile, formatRun } = require('../raiderio');
const { buildProfileEmbed } = require('../embeds');
const { setLastRunIds } = require('../db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('add')
    .setDescription('Ajoute un joueur à la liste de suivi M+')
    .addStringOption(opt =>
      opt.setName('nom')
        .setDescription('Nom du personnage (ex: Arthas)')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('serveur')
        .setDescription('Nom du serveur/realm (ex: Hyjal, Archimonde...)')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('region')
        .setDescription('Région (eu, us, kr, tw) — défaut: eu')
        .setRequired(false)
        .addChoices(
          { name: '🇪🇺 EU', value: 'eu' },
          { name: '🇺🇸 US', value: 'us' },
          { name: '🇰🇷 KR', value: 'kr' },
          { name: '🇹🇼 TW', value: 'tw' },
        )
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const name   = interaction.options.getString('nom');
    const realm  = interaction.options.getString('serveur');
    const region = interaction.options.getString('region') || 'eu';

    // Vérifier que le personnage existe sur Raider.io
    let character;
    try {
      character = await getCharacterProfile(region, realm, name);
    } catch (err) {
      return interaction.editReply(
        `❌ Personnage **${name}** introuvable sur **${realm}** (${region.toUpperCase()}).\n> *Vérifiez l'orthographe du nom et du serveur.*`
      );
    }

    const added = addPlayer(region, realm, name);
    if (!added) {
      return interaction.editReply(
        `⚠️ **${name}** (${realm}) est déjà dans la liste de suivi.`
      );
    }

    // Initialiser les IDs des runs actuels pour ne pas re-notifier les anciennes
    const playerKey = `${region}-${realm}-${name}`.toLowerCase();
    const runs = character.mythic_plus_recent_runs || [];
    if (runs.length > 0) {
      setLastRunIds(playerKey, runs.map(r => r.url));
    }

    const formattedRuns = runs.map(formatRun);
    const embed = buildProfileEmbed({ region, realm, name }, character, formattedRuns);

    await interaction.editReply({
      content: `✅ **${character.name}** ajouté au suivi M+ ! Les nouvelles runs seront annoncées automatiquement.`,
      embeds: [embed],
    });
  },
};
