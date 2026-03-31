const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("analyze")
    .setDescription("Preview the highlight score for a message")
    .addStringOption((option) =>
      option
        .setName("message")
        .setDescription("The message content to analyze")
        .setRequired(true),
    ),

  async execute(interaction) {
    const messageContent = interaction.options.getString("message");
    const mockMessage = {
      content: messageContent,
      author: interaction.user,
      channel: interaction.channel,
      id: `analysis-${Date.now()}`,
      reactions: { cache: new Map() },
    };

    try {
      const analysis = await interaction.client.archivist.analyzeMessage(
        mockMessage,
        {
          bypassConsent: true,
        },
      );

      const embed = new EmbedBuilder()
        .setTitle("Message Analysis")
        .setDescription(`**Message:** "${messageContent}"`)
        .addFields(
          {
            name: "Highlight Score",
            value: `${(analysis.highlightScore * 100).toFixed(1)}%`,
            inline: true,
          },
          {
            name: "Sentiment Score",
            value: `${analysis.sentimentScore.toFixed(2)}`,
            inline: true,
          },
          {
            name: "Reactions",
            value: `${analysis.reactionCount} / ${analysis.reactionThreshold}`,
            inline: true,
          },
          {
            name: "Reaction Contribution",
            value: `${analysis.contributions.reactions.toFixed(2)}`,
            inline: true,
          },
          {
            name: "Keywords",
            value: analysis.keywords.join(", ") || "None",
            inline: false,
          },
          {
            name: "Classification",
            value: analysis.isHighlight ? "Highlight candidate" : "Not a highlight",
            inline: true,
          },
        )
        .setColor(analysis.isHighlight ? 0x16a34a : 0xdc2626)
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({
          content: "Failed to analyze the message preview.",
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: "Failed to analyze the message preview.",
          ephemeral: true,
        });
      }
    }
  },
};
