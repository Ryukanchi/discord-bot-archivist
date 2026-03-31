const { SlashCommandBuilder } = require("discord.js");
const { createArchivistEmbed } = require("../embed-style.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("hello")
    .setDescription("Say hello to Archivist"),

  async execute(interaction) {
    const embed = createArchivistEmbed({
      title: "Hello From Archivist",
      description: `Hello, ${interaction.user.username}. Archivist is ready to help your community keep the moments worth revisiting.`,
    });

    await interaction.reply({ embeds: [embed] });
  },
};
