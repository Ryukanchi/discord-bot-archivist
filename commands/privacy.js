const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("privacy")
    .setDescription("Manage Archivist privacy consent (opt-in)")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("consent")
        .setDescription("Give or revoke consent")
        .addStringOption((option) =>
          option
            .setName("value")
            .setDescription("on or off")
            .setRequired(true)
            .addChoices(
              { name: "on", value: "on" },
              { name: "off", value: "off" },
            ),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("status")
        .setDescription("Show your current consent status"),
    ),
  async execute(interaction) {
    const archivist = interaction.client.archivist;
    const userId = interaction.user.id;

    if (interaction.options.getSubcommand() === "consent") {
      const allow = interaction.options.getString("value") === "on";
      await archivist.setUserConsent(userId, allow);
      const embed = new EmbedBuilder()
        .setTitle("Privacy")
        .setDescription(
          allow
            ? "✅ Consent **ON** — your messages may be analyzed."
            : "❌ Consent **OFF** — your messages will **not** be analyzed.",
        )
        .setColor(allow ? 0x22c55e : 0xef4444);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (interaction.options.getSubcommand() === "status") {
      const status = await archivist.checkUserConsent(userId);
      const embed = new EmbedBuilder()
        .setTitle("Privacy Status")
        .setDescription(status === true ? "✅ ON" : "❌ OFF")
        .setColor(status === true ? 0x22c55e : 0xef4444);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    return interaction.reply({
      content: "❌ Unknown privacy subcommand.",
      ephemeral: true,
    });
  },
};
