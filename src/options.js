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
      opt.setName('name')
        .setDescription('Character name (Arthas, ...)')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('realm')
        .setDescription('Realm name (Hyjal, Tarren Mill, ...)')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('region')
        .setDescription(`Region (eu, us, kr, tw), default ${DEFAULT_REGION}`)
        .setRequired(false)
        .addChoices(...REGIONS)
    );
}

function readCharacterOptions(interaction) {
  return {
    name: interaction.options.getString('name').trim(),
    realm: interaction.options.getString('realm').trim(),
    region: interaction.options.getString('region') || DEFAULT_REGION,
  };
}

module.exports = { addCharacterOptions, readCharacterOptions };
