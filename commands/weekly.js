const { SlashCommandBuilder } = require("discord.js");
const { createArchivistEmbed, trimText } = require("../embed-style.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("weekly")
    .setDescription("Show this week's saved highlights"),

  async execute(interaction) {
    try {
      const report = interaction.client.archivist.generateWeeklyReport(
        undefined,
        interaction.channelId,
      );
      const topMoment = report.highlights[0];
      const secondMoment = report.highlights[1];

      const embed = createArchivistEmbed({
        title: "Archivist Weekly Recap",
        description: `A quick look back at the moments your community made worth revisiting.\n**Week:** ${report.startDate.toLocaleDateString()} - ${report.endDate.toLocaleDateString()}`,
      }).addFields(
        {
          name: "Community Snapshot",
          value: `${report.totalHighlights}`,
          inline: true,
        },
        {
          name: "Top Highlight",
          value: topMoment
            ? trimText(topMoment.anonymized_content, 220)
            : "No highlights were saved this week.",
          inline: false,
        },
      );

      if (topMoment) {
        embed.addFields({
          name: "Most Loved Moment",
          value: `${topMoment.reaction_count} reactions and a sentiment score of ${topMoment.sentiment_score.toFixed(2)}.`,
          inline: false,
        });
      }

      if (secondMoment) {
        embed.addFields({
          name: "Worth Revisiting",
          value: trimText(secondMoment.anonymized_content, 160),
          inline: false,
        });
      }

      await interaction.reply({ embeds: [embed] });
    } catch {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({
          content: "Failed to build the weekly report.",
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: "Failed to build the weekly report.",
          ephemeral: true,
        });
      }
    }
  },
};
