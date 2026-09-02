const { SlashCommandBuilder } = require("discord.js");
const { createArchivistEmbed } = require("../embed-style.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check Archivist system latency"),

  async execute(interaction) {
    const sent = await interaction.reply({
      content: "Measuring latency...",
      fetchReply: true,
    });

    const roundtripLatency =
      sent.createdTimestamp - interaction.createdTimestamp;
    const websocketLatency = interaction.client.ws.ping;

    const embed = createArchivistEmbed({
      title: "Archivist Latency",
      description:
        "A quick health check for Archivist response time and gateway latency.",
      color: "success",
    }).addFields(
      {
        name: "Roundtrip Latency",
        value: `${roundtripLatency}ms`,
        inline: true,
      },
      {
        name: "Websocket Latency",
        value: `${websocketLatency}ms`,
        inline: true,
      },
      {
        name: "Status",
        value: "Operational",
        inline: true,
      },
    );

    await interaction.editReply({ content: "", embeds: [embed] });
  },
};
