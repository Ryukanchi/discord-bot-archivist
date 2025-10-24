const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("analyze")
    .setDescription("Analyzes a message for highlight potential")
    .addStringOption((option) =>
      option
        .setName("message")
        .setDescription("The message to analyze")
        .setRequired(true),
    ),

  async execute(interaction) {
    const messageContent = interaction.options.getString("message");

    // Create a mock message object for analysis
    const mockMessage = {
      content: messageContent,
      author: interaction.user,
      channel: interaction.channel,
      id: `analysis_${Date.now()}`,
      createdAt: new Date(),
      reactions: { cache: { size: 0 } },
    };

    try {
      const archivist = interaction.client.archivist;
      const analysis = await archivist.analyzeMessage(mockMessage, {
        bypassConsent: true,
      });

      const embed = new EmbedBuilder()
        .setTitle("🔍 Message Analysis")
        .setDescription(`**Message:** "${messageContent}"`)
        .addFields(
          {
            name: "Highlight Score",
            value: `${(analysis.highlightScore * 100).toFixed(1)}%`,
            inline: true,
          },
          {
            name: "Sentiment",
            value: `${analysis.sentimentScore.toFixed(2)}`,
            inline: true,
          },
          {
            name: "Reactions",
            value: `${analysis.reactionCount}`,
            inline: true,
          },
          {
            name: "Keywords",
            value: analysis.keywords.join(", ") || "None",
            inline: false,
          },
          {
            name: "Status",
            value: analysis.isHighlight ? "✅ Highlight!" : "❌ No Highlight",
            inline: true,
          },
        )
        .setColor(analysis.isHighlight ? 0x00ff00 : 0xff0000)
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error("❌ Error during analysis command:", error);
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({
          content: "❌ Error during analysis!",
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: "❌ Error during analysis!",
          ephemeral: true,
        });
      }
    }
  },
};
