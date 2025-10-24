const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Tests bot connection and shows latency"),

  async execute(interaction) {
    const sent = await interaction.reply({
      content: "🏓 Pong!",
      fetchReply: true,
    });
    const roundtripLatency =
      sent.createdTimestamp - interaction.createdTimestamp;
    const websocketLatency = interaction.client.ws.ping;

    const embed = new EmbedBuilder()
      .setTitle("🏓 Pong!")
      .addFields(
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
        { name: "Status", value: "✅ Bot is online!", inline: true },
      )
      .setColor(0x00ff00)
      .setTimestamp();

    await interaction.editReply({ content: "", embeds: [embed] });
  },
};
