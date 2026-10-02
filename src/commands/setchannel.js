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
    .setDescription('Set the channel where new M+ runs are announced')
    .addChannelOption(opt =>
      opt.setName('channel')
        .setDescription('Target channel (empty for the current one)')
        .setRequired(false)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    const channel = interaction.options.getChannel('channel') || interaction.channel;

    if (!channel?.isTextBased?.()) {
      return interaction.reply({
        content: '❌ Messages cannot be sent in this channel. Pick a text channel.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const me = interaction.guild?.members.me;
    const permissions = me ? channel.permissionsFor(me) : null;
    if (permissions && !permissions.has(REQUIRED_PERMISSIONS)) {
      return interaction.reply({
        content: `❌ I am missing permissions in ${channel}: **View Channel**, **Send Messages** and **Embed Links** are required.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    setChannel(interaction.guildId, channel.id);
    await interaction.reply(`✅ M+ runs will be announced in ${channel}.`);
  },
};
