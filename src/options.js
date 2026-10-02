const REGIONS = [
  { name: '🇪🇺 EU', value: 'eu' },
  { name: '🇺🇸 US', value: 'us' },
  { name: '🇰🇷 KR', value: 'kr' },
  { name: '🇹🇼 TW', value: 'tw' },
];
const DEFAULT_REGION = 'eu';

function addCharacterOptions(builder) {
  return builder
    .addStringOption(opt =>
      opt.setName('nom')
        .setDescription('Nom du personnage (ex: Arthas)')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('serveur')
        .setDescription('Nom du serveur/realm (ex: Hyjal, Tarren Mill...)')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('region')
        .setDescription(`Région (eu, us, kr, tw) — défaut: ${DEFAULT_REGION}`)
        .setRequired(false)
        .addChoices(...REGIONS)
    );
}

function readCharacterOptions(interaction) {
  return {
    name: interaction.options.getString('nom').trim(),
    realm: interaction.options.getString('serveur').trim(),
    region: interaction.options.getString('region') || DEFAULT_REGION,
  };
}

module.exports = { addCharacterOptions, readCharacterOptions };
