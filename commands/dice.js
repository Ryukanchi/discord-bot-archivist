const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("dice")
    .setDescription("Roll a die with a configurable number of sides")
    .addIntegerOption((option) =>
      option
        .setName("sides")
        .setDescription("The number of sides on the die")
        .setMinValue(2)
        .setMaxValue(100)
        .setRequired(false),
    ),

  async execute(interaction) {
    const sides = interaction.options.getInteger("sides") || 6;
    const result = Math.floor(Math.random() * sides) + 1;

    const embed = new EmbedBuilder()
      .setTitle("Dice Roll")
      .setDescription(`Rolled a ${sides}-sided die: **${result}**`)
      .setColor(0x2563eb)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
