const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("random")
    .setDescription("Generate a random number between 1 and 100"),

  async execute(interaction) {
    const value = Math.floor(Math.random() * 100) + 1;

    const embed = new EmbedBuilder()
      .setTitle("Random Number")
      .setDescription(`Generated value: **${value}**`)
      .setColor(0x7c3aed)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
