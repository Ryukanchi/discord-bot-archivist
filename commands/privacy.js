const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const { createArchivistEmbed } = require("../embed-style.js");

const DELETE_CONFIRM_PREFIX = "privacy:delete";

function buildDeleteConfirmationRow(userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${DELETE_CONFIRM_PREFIX}:confirm:${userId}`)
      .setLabel("Delete data")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`${DELETE_CONFIRM_PREFIX}:cancel:${userId}`)
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary),
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("privacy")
    .setDescription("Manage Archivist consent and privacy settings")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("consent")
        .setDescription("Opt in or out of Archivist memory processing")
        .addStringOption((option) =>
          option
            .setName("action")
            .setDescription("Choose whether Archivist should process your messages")
            .setRequired(true)
            .addChoices(
              { name: "Opt In", value: "opt-in" },
              { name: "Opt Out", value: "opt-out" },
            ),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("status")
        .setDescription("Show your current consent status"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("delete")
        .setDescription("Delete your stored Archivist data"),
    ),

  async execute(interaction) {
    const archivist = interaction.client.archivist;
    const userId = interaction.user.id;
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "consent") {
      const enabled = interaction.options.getString("action") === "opt-in";
      await archivist.setUserConsent(userId, enabled);

      const embed = createArchivistEmbed({
        title: "Archivist Privacy Settings",
        description: enabled
          ? "✅ You have enabled Archivist memory and highlights."
          : "⚠️ You have disabled Archivist memory. Your messages will no longer be processed.",
        color: enabled ? "success" : "danger",
      });

      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    if (subcommand === "status") {
      const status = await archivist.checkUserConsent(userId);
      const enabled = archivist.isConsentGranted(status);
      const embed = createArchivistEmbed({
        title: "Archivist Privacy Status",
        description: enabled
          ? "Consent is enabled for highlight analysis."
          : "Consent is disabled for highlight analysis.",
        color: enabled ? "success" : "danger",
      });

      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    if (subcommand === "delete") {
      await interaction.reply({
        embeds: [
          createArchivistEmbed({
            title: "Delete Archivist Data",
            description:
              "Archivist can remove your stored highlight history, privacy record, and related point data. This only affects data already stored for you.",
            color: "warm",
          }),
        ],
        components: [buildDeleteConfirmationRow(userId)],
        ephemeral: true,
      });
      return;
    }

    await interaction.reply({
      content: "Unknown privacy subcommand.",
      ephemeral: true,
    });
  },

  async handleComponent(interaction) {
    if (!interaction.isButton() || !interaction.customId.startsWith(`${DELETE_CONFIRM_PREFIX}:`)) {
      return false;
    }

    const [, , action, ownerId] = interaction.customId.split(":");
    if (interaction.user.id !== ownerId) {
      await interaction.reply({
        embeds: [
          createArchivistEmbed({
            title: "Archivist Privacy Controls",
            description: "This confirmation belongs to another user.",
            color: "danger",
          }),
        ],
        ephemeral: true,
      });
      return true;
    }

    if (action === "confirm") {
      await interaction.client.archivist.deleteUserData(interaction.user.id);
      await interaction.update({
        embeds: [
          createArchivistEmbed({
            title: "Archivist Data Deleted",
            description: "🧹 Your stored Archivist data has been deleted.",
            color: "success",
          }),
        ],
        components: [],
      });
      return true;
    }

    if (action === "cancel") {
      await interaction.update({
        embeds: [
          createArchivistEmbed({
            title: "Archivist Data Deletion Cancelled",
            description: "No stored Archivist data was deleted.",
            color: "muted",
          }),
        ],
        components: [],
      });
      return true;
    }

    return false;
  },
};
