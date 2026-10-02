const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  InteractionContextType,
  ChannelType,
  MessageFlags,
} = require('discord.js');
const { setChannel } = require('../db');

const REQUIRED_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setchannel')
    .setDescription('Définit le canal où les nouvelles runs M+ seront annoncées')
    .addChannelOption(opt =>
      opt.setName('canal')
        .setDescription('Canal Discord cible (laisser vide = canal actuel)')
        .setRequired(false)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    const channel = interaction.options.getChannel('canal') || interaction.channel;

    if (!channel?.isTextBased?.()) {
      return interaction.reply({
        content: '❌ Ce canal ne permet pas d\'envoyer des messages. Choisissez un canal textuel.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const me = interaction.guild?.members.me;
    const permissions = me ? channel.permissionsFor(me) : null;
    if (permissions && !permissions.has(REQUIRED_PERMISSIONS)) {
      return interaction.reply({
        content: `❌ Il me manque des permissions dans ${channel} : **Voir le salon**, **Envoyer des messages** et **Intégrer des liens** sont requises.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    setChannel(interaction.guildId, channel.id);
    await interaction.reply(`✅ Les annonces M+ seront envoyées dans ${channel}.`);
  },
};
