const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  AttachmentBuilder,
} = require("discord.js");
const fs = require("fs").promises;
const path = require("path");
const os = require("os");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("archivist")
    .setDescription("Advanced archivist commands")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("leaderboard")
        .setDescription("Show highlight leaderboard")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("points")
        .setDescription("Show your points or another user's points")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("User to check points for")
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("backup")
        .setDescription("Create a backup of highlights data")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("clear")
        .setDescription("Clear all highlights data (Admin only)")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("diagnose")
        .setDescription("Run a system diagnostics check (Admin only)")
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("help").setDescription("Show archivist help")
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const archivist = interaction.client.archivist;

    try {
      switch (subcommand) {
        case "leaderboard": {
          const leaderboard = archivist.getLeaderboard(10);
          const leaderboardEmbed = new EmbedBuilder()
            .setTitle("🏆 Highlight Leaderboard")
            .setDescription("Top highlight curators")
            .setColor(0xffd700)
            .setTimestamp();

          leaderboard.forEach((user, index) => {
            leaderboardEmbed.addFields({
              name: `#${index + 1}`,
              value: `Anonymized ID: ...${user.user_id.slice(
                -6
              )} — ${user.points} points`,
              inline: true,
            });
          });

          await interaction.reply({ embeds: [leaderboardEmbed] });
          break;
        }

        case "points": {
          const targetUser =
            interaction.options.getUser("user") || interaction.user;
          const userPoints = archivist.getUserPoints(targetUser.id);

          const pointsEmbed = new EmbedBuilder()
            .setTitle("📊 User Points")
            .addFields(
              { name: "User", value: targetUser.username, inline: true },
              { name: "Points", value: `${userPoints.points}`, inline: true },
              {
                name: "Highlights Created",
                value: `${userPoints.highlights_created}`,
                inline: true,
              },
              {
                name: "Votes Cast",
                value: `${userPoints.votes_cast}`,
                inline: true,
              }
            )
            .setColor(0x0099ff)
            .setTimestamp();

          await interaction.reply({ embeds: [pointsEmbed] });
          break;
        }

        case "backup": {
          if (
            !interaction.member.permissions.has(
              PermissionFlagsBits.Administrator
            )
          ) {
            return interaction.reply({
              content: "❌ Only administrators can create backups.",
              ephemeral: true,
            });
          }

          await interaction.deferReply({ ephemeral: true });

          const rows = archivist.db
            .prepare("SELECT * FROM highlights_anonymized")
            .all();
          const payload = {
            highlights: rows,
            timestamp: new Date().toISOString(),
            version: 1,
          };

          const filePath = path.join(
            os.tmpdir(),
            `archivist_backup_${Date.now()}.json`
          );
          await fs.writeFile(
            filePath,
            JSON.stringify(payload, null, 2),
            "utf8"
          );

          const file = new AttachmentBuilder(filePath);

          try {
            const dm = await interaction.user.createDM();
            await dm.send({
              embeds: [
                new EmbedBuilder()
                  .setTitle("💾 Backup Created")
                  .setDescription("Your backup is attached.")
                  .setColor(0x00ff00)
                  .setTimestamp(),
              ],
              files: [file],
            });
            await interaction.editReply(
              "✅ Backup created. I sent it to your DMs."
            );
          } catch (error) {
            console.error("❌ Failed to send backup via DM:", error);
            await interaction.editReply(
              "❌ Backup created, but I could not DM you. Please enable DMs from server members."
            );
          } finally {
            try {
              await fs.unlink(filePath);
            } catch (error) {
              console.error("❌ Failed to delete temporary backup file:", error);
            }
          }

          break;
        }

        case "clear": {
          if (
            !interaction.member.permissions.has(
              PermissionFlagsBits.Administrator
            )
          ) {
            await interaction.reply({
              content: "❌ Only administrators can delete highlights!",
              ephemeral: true,
            });
            return;
          }

          archivist.db.exec("DELETE FROM highlights_anonymized");
          archivist.db.exec("DELETE FROM user_points");
          archivist.db.exec("DELETE FROM user_privacy");

          const clearEmbed = new EmbedBuilder()
            .setTitle("🗑️ Data Cleared")
            .setDescription("✅ All highlights data has been deleted.")
            .setColor(0xff0000)
            .setTimestamp();

          await interaction.reply({ embeds: [clearEmbed] });
          break;
        }

        case "diagnose": {
          if (
            !interaction.member.permissions.has(
              PermissionFlagsBits.Administrator
            )
          ) {
            await interaction.reply({
              content: "❌ Only administrators can run diagnostics!",
              ephemeral: true,
            });
            return;
          }

          await interaction.deferReply({ ephemeral: true });

          const diagnostics = [];
          let hasFailure = false;
          const mark = (label, success, detail) => {
            if (!success) {
              hasFailure = true;
            }
            diagnostics.push({
              name: label,
              value: `${success ? "✅" : "❌"} ${detail}`,
            });
          };

          try {
            // Environment variables
            try {
              const requiredEnv = [
                "DISCORD_TOKEN",
                "DATABASE_PATH",
                "DATA_RETENTION_DAYS",
                "AUTO_DELETE_ENABLED",
              ];
              const missing = requiredEnv.filter(
                (key) => !process.env[key] || process.env[key].length === 0
              );
              if (missing.length === 0) {
                mark(
                  "Environment Variables",
                  true,
                  "All required environment variables are set."
                );
              } else {
                mark(
                  "Environment Variables",
                  false,
                  `Missing: ${missing.join(", ")}`
                );
              }
            } catch (error) {
              mark(
                "Environment Variables",
                false,
                `Failed to verify environment variables: ${error.message}`
              );
            }

            // Database file
            try {
              const dbPath =
                process.env.DATABASE_PATH || path.join(process.cwd(), "highlights.db");
              await fs.access(dbPath);
              mark(
                "Database File",
                true,
                `Database file accessible at ${dbPath}`
              );
            } catch (error) {
              mark(
                "Database File",
                false,
                `Database file not accessible: ${error.message}`
              );
            }

            // Table existence
            try {
              const tables = [
                "highlights_anonymized",
                "user_points",
                "user_privacy",
              ];
              const missingTables = tables.filter((table) => {
                const result = archivist.db
                  .prepare(
                    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?"
                  )
                  .get(table);
                return !result;
              });

              if (missingTables.length === 0) {
                mark(
                  "Database Tables",
                  true,
                  "Required tables exist."
                );
              } else {
                mark(
                  "Database Tables",
                  false,
                  `Missing tables: ${missingTables.join(", ")}`
                );
              }
            } catch (error) {
              mark(
                "Database Tables",
                false,
                `Failed to verify tables: ${error.message}`
              );
            }

            // Discord connection
            try {
              const isReady = interaction.client.isReady();
              mark(
                "Discord Connection",
                isReady,
                isReady
                  ? `Client logged in as ${interaction.client.user.tag}`
                  : "Client is not logged in."
              );
            } catch (error) {
              mark(
                "Discord Connection",
                false,
                `Failed to verify Discord connection: ${error.message}`
              );
            }

            // Command registration
            try {
              const commandCount = interaction.client.commands?.size || 0;
              mark(
                "Command Registry",
                commandCount >= 1,
                commandCount >= 1
                  ? `Loaded ${commandCount} command(s).`
                  : "No commands loaded."
              );
            } catch (error) {
              mark(
                "Command Registry",
                false,
                `Failed to inspect command registry: ${error.message}`
              );
            }

            const diagnosticsEmbed = new EmbedBuilder()
              .setTitle("🩺 Archivist Diagnostics")
              .setColor(hasFailure ? 0xef4444 : 0x22c55e)
              .setTimestamp();

            diagnostics.forEach((entry) => {
              diagnosticsEmbed.addFields({
                name: entry.name,
                value: entry.value,
                inline: false,
              });
            });

            await interaction.editReply({ embeds: [diagnosticsEmbed] });
            console.log("✅ Diagnostics completed");
          } catch (error) {
            console.error("❌ Diagnostics failed:", error);
            if (interaction.deferred || interaction.replied) {
              await interaction.followUp({
                content: "❌ Diagnostics failed to complete.",
                ephemeral: true,
              });
            } else {
              await interaction.reply({
                content: "❌ Diagnostics failed to complete.",
                ephemeral: true,
              });
            }
          }

          break;
        }

        case "help": {
          const helpEmbed = new EmbedBuilder()
            .setTitle("🤖 Server Archivist")
            .setDescription("Highlight management tools available:")
            .addFields(
              {
                name: "🏆 Leaderboard",
                value: "/archivist leaderboard",
                inline: true,
              },
              {
                name: "📊 Points",
                value: "/archivist points [user]",
                inline: true,
              },
              {
                name: "💾 Backup",
                value: "/archivist backup",
                inline: true,
              },
              {
                name: "🩺 Diagnose",
                value: "/archivist diagnose",
                inline: true,
              },
              {
                name: "🗑️ Clear",
                value: "/archivist clear",
                inline: true,
              },
              {
                name: "🆘 Help",
                value: "/archivist help",
                inline: true,
              }
            )
            .setColor(0x9932cc)
            .setTimestamp();

          await interaction.reply({ embeds: [helpEmbed] });
          break;
        }
      }
    } catch (error) {
      console.error("❌ Error processing archivist command:", error);
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({
          content: "❌ Error processing archivist command!",
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: "❌ Error processing archivist command!",
          ephemeral: true,
        });
      }
    }
  },
};
