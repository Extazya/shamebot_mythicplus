const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { setChannel } = require('../db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setchannel')
    .setDescription('Définit le canal où les nouvelles runs M+ seront annoncées')
    .addChannelOption(opt =>
      opt.setName('canal')
        .setDescription('Canal Discord cible (laisser vide = canal actuel)')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const channel = interaction.options.getChannel('canal') || interaction.channel;

    setChannel(channel.id);

    await interaction.reply(
      `✅ Les annonces M+ seront envoyées dans ${channel}.\n` +
      `> Assurez-vous que j'ai bien la permission d'envoyer des messages dans ce canal.`
    );
  },
};
