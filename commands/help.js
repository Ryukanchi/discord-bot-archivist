const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Shows all available commands"),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setTitle("🤖 Bot Commands")
      .setDescription("Current commands you can use:")
      .addFields(
        { name: "/ping", value: "Check bot latency", inline: true },
        { name: "/hello", value: "Simple greeting", inline: true },
        { name: "/help", value: "Show this help", inline: true },
        { name: "/info", value: "Bot information", inline: true },
        { name: "/random", value: "Random number", inline: true },
        { name: "/dice", value: "Roll a dice with custom sides", inline: true },
        { name: "/analyze", value: "Analyze a message", inline: true },
        { name: "/weekly", value: "Weekly highlights report", inline: true },
        { name: "/privacy", value: "Manage highlight consent", inline: true },
        { name: "/archivist", value: "Advanced archivist tools", inline: true }
      )
      .setColor(0x00ff00)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
