const {
  SlashCommandBuilder,
  EmbedBuilder,
  AttachmentBuilder,
  PermissionFlagsBits,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const fs = require("fs").promises;
const path = require("path");
const os = require("os");

const logger = require("../logger.js");
const { createArchivistEmbed, EMBED_COLORS, trimText } = require("../embed-style.js");

const ADMIN_CHANNEL_TYPES = [
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.PublicThread,
  ChannelType.PrivateThread,
];
const MOTD_CONTROL_PREFIX = "archivist:motd";
const WEEKLY_CONTROL_PREFIX = "archivist:weekly";

function isAdministrator(interaction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
}

async function requireAdministrator(interaction, message) {
  if (isAdministrator(interaction)) {
    return true;
  }

  await interaction.reply({
    content: message,
    ephemeral: true,
  });
  return false;
}

function formatChannelRules(summary) {
  if (summary.includes.length === 0 && summary.excludes.length === 0) {
    return "All channels are currently monitored.";
  }

  const includeText =
    summary.includes.length > 0
      ? summary.includes.map((rule) => `<#${rule.channel_id}>`).join(", ")
      : "None";
  const excludeText =
    summary.excludes.length > 0
      ? summary.excludes.map((rule) => `<#${rule.channel_id}>`).join(", ")
      : "None";

  return `Included: ${includeText}\nExcluded: ${excludeText}`;
}

function formatWeeklyStatus(config) {
  if (!config.enabled) {
    return "Off";
  }
  return config.channelId
    ? `On in <#${config.channelId}>`
    : "On, but no recap channel is configured";
}

function formatMomentOfDayStatus(config) {
  if (!config.enabled) {
    return "Off";
  }

  const channelText = config.channelId
    ? `in <#${config.channelId}>`
    : "without a configured channel";
  return `On ${channelText} at ${String(config.postHourUtc).padStart(2, "0")}:00 UTC`;
}

function formatDateTime(value) {
  if (!value) {
    return "Not scheduled";
  }

  const timestamp = Math.floor(value.getTime() / 1000);
  return `<t:${timestamp}:f>`;
}

function formatMomentOfDayLastPost(config) {
  if (!config.lastSentDateKey) {
    return "No daily moment has been posted yet.";
  }

  const messageSuffix = config.lastSentMessageId
    ? ` (message ...${config.lastSentMessageId.slice(-6)})`
    : "";
  return `${config.lastSentDateKey}${messageSuffix}`;
}

function formatWeeklyLastPost(config) {
  if (!config.lastSentWeekKey) {
    return "No weekly recap has been posted yet.";
  }

  return config.lastSentWeekKey;
}

function getNextWeeklyRun(now = new Date()) {
  const nextRun = new Date(now);
  nextRun.setMinutes(0, 0, 0);
  nextRun.setHours(9);

  const day = nextRun.getDay();
  const daysUntilMonday = day === 0 ? 1 : day === 1 ? 0 : 8 - day;
  nextRun.setDate(nextRun.getDate() + daysUntilMonday);

  if (now >= nextRun) {
    nextRun.setDate(nextRun.getDate() + 7);
  }

  return nextRun;
}

function buildWeeklyControls(userId, config) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${WEEKLY_CONTROL_PREFIX}:enable:${userId}`)
      .setLabel("Enable")
      .setStyle(ButtonStyle.Success)
      .setDisabled(config.enabled),
    new ButtonBuilder()
      .setCustomId(`${WEEKLY_CONTROL_PREFIX}:disable:${userId}`)
      .setLabel("Disable")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!config.enabled),
    new ButtonBuilder()
      .setCustomId(`${WEEKLY_CONTROL_PREFIX}:post:${userId}`)
      .setLabel("Post now")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`${WEEKLY_CONTROL_PREFIX}:refresh:${userId}`)
      .setLabel("Refresh")
      .setStyle(ButtonStyle.Secondary),
  );
}

function buildWeeklyStatusEmbed(archivist, options = {}) {
  const config = archivist.getWeeklyRecapConfig();
  const nextRun = config.enabled && config.channelId ? getNextWeeklyRun() : null;
  const description = config.enabled
    ? "Archivist can publish a weekly look back at the strongest saved community moments."
    : "Weekly recap is currently off. Enable it when you want Archivist to post a weekly highlights digest.";

  const embed = createArchivistEmbed({
    title: "Weekly Recap",
    description,
    color: config.enabled ? "success" : "muted",
  }).addFields(
    {
      name: "Status",
      value: formatWeeklyStatus(config),
      inline: false,
    },
    {
      name: "Channel",
      value: config.channelId ? `<#${config.channelId}>` : "Not configured",
      inline: true,
    },
    {
      name: "Schedule",
      value: "Mondays after 09:00 local server time",
      inline: true,
    },
    {
      name: "Next Scheduled Run",
      value: formatDateTime(nextRun),
      inline: true,
    },
    {
      name: "Last Posted Week",
      value: formatWeeklyLastPost(config),
      inline: false,
    },
  );

  if (options.notice) {
    embed.addFields({
      name: "Update",
      value: options.notice,
      inline: false,
    });
  }

  return embed;
}

async function replyWithWeeklyStatus(interaction, options = {}) {
  const archivist = interaction.client.archivist;
  const config = archivist.getWeeklyRecapConfig();
  const payload = {
    embeds: [buildWeeklyStatusEmbed(archivist, options)],
    components: [buildWeeklyControls(interaction.user.id, config)],
    ephemeral: true,
  };

  if (interaction.isButton()) {
    await interaction.update(payload);
    return;
  }

  await interaction.reply(payload);
}

async function handleWeeklyAction(interaction, action, options = {}) {
  const archivist = interaction.client.archivist;
  const runtime = interaction.client.runtime;
  const currentConfig = archivist.getWeeklyRecapConfig();

  if (action === "status" || action === "refresh") {
    await replyWithWeeklyStatus(interaction, options);
    return true;
  }

  if (action === "enable") {
    const targetChannelId = options.channelId || currentConfig.channelId;

    if (currentConfig.enabled && targetChannelId === currentConfig.channelId) {
      await replyWithWeeklyStatus(interaction, {
        notice: "Weekly recap is already enabled with the current settings.",
      });
      return true;
    }

    if (!targetChannelId) {
      await replyWithWeeklyStatus(interaction, {
        notice: "Choose a recap channel before enabling weekly recap.",
      });
      return true;
    }

    archivist.setWeeklyRecapConfig({ enabled: true, channelId: targetChannelId });
    await replyWithWeeklyStatus(interaction, {
      notice: `Weekly recap is enabled for <#${targetChannelId}>.`,
    });
    return true;
  }

  if (action === "disable") {
    if (!currentConfig.enabled) {
      await replyWithWeeklyStatus(interaction, {
        notice: "Weekly recap is already disabled.",
      });
      return true;
    }

    archivist.setWeeklyRecapConfig({
      enabled: false,
      channelId: currentConfig.channelId,
    });
    await replyWithWeeklyStatus(interaction, {
      notice: "Weekly recap is now disabled.",
    });
    return true;
  }

  if (action === "post") {
    if (options.channelId) {
      archivist.setWeeklyRecapConfig({
        enabled: currentConfig.enabled,
        channelId: options.channelId,
      });
    }

    const posted = await runtime.dispatchWeeklyRecap(interaction.client, "weekly-command");
    await replyWithWeeklyStatus(interaction, {
      notice: posted
        ? "Weekly recap was posted successfully."
        : "No weekly recap could be posted. Check the configured channel, Archivist permissions, and whether any highlights qualified this week.",
    });
    return true;
  }

  return false;
}

function buildMomentOfDayControls(userId, config) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${MOTD_CONTROL_PREFIX}:enable:${userId}`)
      .setLabel("Enable")
      .setStyle(ButtonStyle.Success)
      .setDisabled(config.enabled),
    new ButtonBuilder()
      .setCustomId(`${MOTD_CONTROL_PREFIX}:disable:${userId}`)
      .setLabel("Disable")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!config.enabled),
    new ButtonBuilder()
      .setCustomId(`${MOTD_CONTROL_PREFIX}:post:${userId}`)
      .setLabel("Post now")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`${MOTD_CONTROL_PREFIX}:refresh:${userId}`)
      .setLabel("Refresh")
      .setStyle(ButtonStyle.Secondary),
  );
}

function buildMomentOfDayStatusEmbed(archivist, options = {}) {
  const config = archivist.getMomentOfDayConfig();
  const nextRun = archivist.getNextMomentOfDayRun();
  const summary = config.enabled
    ? "Archivist can feature one saved moment per day when a qualifying highlight is available."
    : "Moment of the Day is currently off. Enable it when you want Archivist to feature a saved community moment each day.";

  const embed = createArchivistEmbed({
    title: "Moment of the Day",
    description: summary,
    color: config.enabled ? "success" : "muted",
  }).addFields(
    {
      name: "Status",
      value: formatMomentOfDayStatus(config),
      inline: false,
    },
    {
      name: "Channel",
      value: config.channelId ? `<#${config.channelId}>` : "Not configured",
      inline: true,
    },
    {
      name: "Post Hour",
      value: `${String(config.postHourUtc).padStart(2, "0")}:00 UTC`,
      inline: true,
    },
    {
      name: "Next Scheduled Run",
      value: formatDateTime(nextRun),
      inline: true,
    },
    {
      name: "Last Posted Moment",
      value: formatMomentOfDayLastPost(config),
      inline: false,
    },
  );

  if (options.notice) {
    embed.addFields({
      name: "Update",
      value: options.notice,
      inline: false,
    });
  }

  return embed;
}

async function replyWithMomentOfDayStatus(interaction, options = {}) {
  const archivist = interaction.client.archivist;
  const config = archivist.getMomentOfDayConfig();
  const payload = {
    embeds: [buildMomentOfDayStatusEmbed(archivist, options)],
    components: [buildMomentOfDayControls(interaction.user.id, config)],
    ephemeral: true,
  };

  if (interaction.isButton()) {
    await interaction.update(payload);
    return;
  }

  await interaction.reply(payload);
}

async function handleMomentOfDayAction(interaction, action, options = {}) {
  const archivist = interaction.client.archivist;
  const runtime = interaction.client.runtime;
  const currentConfig = archivist.getMomentOfDayConfig();

  if (action === "status" || action === "refresh") {
    await replyWithMomentOfDayStatus(interaction, options);
    return true;
  }

  if (action === "enable") {
    const targetChannelId = options.channelId || currentConfig.channelId;
    const targetHour = options.hour ?? currentConfig.postHourUtc;

    if (currentConfig.enabled && targetChannelId === currentConfig.channelId && targetHour === currentConfig.postHourUtc) {
      await replyWithMomentOfDayStatus(interaction, {
        notice: "Moment of the Day is already enabled with the current settings.",
      });
      return true;
    }

    if (!targetChannelId) {
      await replyWithMomentOfDayStatus(interaction, {
        notice: "Choose a target channel before enabling Moment of the Day.",
      });
      return true;
    }

    archivist.setMomentOfDayConfig({
      enabled: true,
      channelId: targetChannelId,
      postHourUtc: targetHour,
    });

    await replyWithMomentOfDayStatus(interaction, {
      notice: `Moment of the Day is enabled for <#${targetChannelId}> at ${String(targetHour).padStart(2, "0")}:00 UTC.`,
    });
    return true;
  }

  if (action === "disable") {
    if (!currentConfig.enabled) {
      await replyWithMomentOfDayStatus(interaction, {
        notice: "Moment of the Day is already disabled.",
      });
      return true;
    }

    archivist.setMomentOfDayConfig({
      enabled: false,
      channelId: currentConfig.channelId,
      postHourUtc: currentConfig.postHourUtc,
    });

    await replyWithMomentOfDayStatus(interaction, {
      notice: "Moment of the Day is now disabled.",
    });
    return true;
  }

  if (action === "post") {
    const posted = await runtime.dispatchMomentOfDay(
      interaction.client,
      "motd-command",
      { force: true },
    );

    await replyWithMomentOfDayStatus(interaction, {
      notice: posted
        ? "Moment of the Day was posted successfully."
        : "No qualifying daily moment could be posted. Check the configured channel, threshold, privacy consent, and available highlights.",
    });
    return true;
  }

  return false;
}

function buildOverviewEmbed(interaction) {
  const archivist = interaction.client.archivist;
  const runtimeHealth = interaction.client.runtime.getHealthSnapshot();
  const snapshot = archivist.getHealthSnapshot(runtimeHealth);
  const privacyMode = "Consent-based analysis";
  const momentOfDay = snapshot.momentOfDay;
  const nextMomentOfDayRun = archivist.getNextMomentOfDayRun();

  return new EmbedBuilder()
    .setTitle("Archivist Control Center")
    .setDescription(
      "A quick view of highlight activity, recap delivery, privacy mode, and the systems that keep community memory running.",
    )
    .addFields(
      {
        name: "System Status",
        value: interaction.client.isReady() ? "Connected" : "Starting",
        inline: true,
      },
      {
        name: "Saved Highlights",
        value: String(snapshot.highlightCount),
        inline: true,
      },
      {
        name: "Threshold",
        value: `Score ${snapshot.minScore.toFixed(2)} / Reactions ${snapshot.reactionThreshold}`,
        inline: true,
      },
      {
        name: "Privacy Mode",
        value: privacyMode,
        inline: true,
      },
      {
        name: "Monitored Channels",
        value: formatChannelRules(snapshot.monitoring),
        inline: false,
      },
      {
        name: "Recap Delivery",
        value: formatWeeklyStatus(snapshot.weeklyRecap),
        inline: true,
      },
      {
        name: "Moment Of The Day",
        value: formatMomentOfDayStatus(momentOfDay),
        inline: true,
      },
      {
        name: "Highlight Posts",
        value: snapshot.autoHighlightPosting.enabled
          ? snapshot.autoHighlightPosting.channelId
            ? `On in <#${snapshot.autoHighlightPosting.channelId}>`
            : "On, but no post channel is configured"
          : "Off",
        inline: true,
      },
      {
        name: "Next Daily Run",
        value: formatDateTime(nextMomentOfDayRun),
        inline: true,
      },
      {
        name: "Last Daily Moment",
        value: formatMomentOfDayLastPost(momentOfDay),
        inline: false,
      },
      {
        name: "System Health",
        value: `DB: ${snapshot.databaseReachable ? "OK" : "Issue"}\nLast event: ${runtimeHealth.lastProcessedEvent}\nRecent errors: ${runtimeHealth.recentErrorCount}`,
        inline: false,
      },
    )
    .setColor(EMBED_COLORS.primary)
    .setFooter({ text: "Use /archivist inspect to explain an individual highlight decision." })
    .setTimestamp();
}

function buildHealthEmbed(interaction) {
  const archivist = interaction.client.archivist;
  const runtimeHealth = interaction.client.runtime.getHealthSnapshot();
  const snapshot = archivist.getHealthSnapshot(runtimeHealth);

  return createArchivistEmbed({
    title: "Archivist Health",
    description:
      "Operational detail for message processing, storage, and recent runtime activity.",
    color: snapshot.databaseReachable ? "success" : "danger",
  })
    .addFields(
      {
        name: "Database",
        value: snapshot.databaseReachable ? "Reachable" : "Not reachable",
        inline: true,
      },
      {
        name: "Stored Highlights",
        value: String(snapshot.highlightCount),
        inline: true,
      },
      {
        name: "Queue Depth",
        value: String(runtimeHealth.queueDepth),
        inline: true,
      },
      {
        name: "Last Processed Event",
        value: runtimeHealth.lastProcessedEvent,
        inline: true,
      },
      {
        name: "Processed Events",
        value: String(runtimeHealth.processedEvents),
        inline: true,
      },
      {
        name: "Recent Error Count",
        value: String(runtimeHealth.recentErrorCount),
        inline: true,
      },
    );
}

function buildPrivacyEmbed(archivist) {
  const privacy = archivist.getPrivacySummary();
  return createArchivistEmbed({
    title: "Privacy Overview",
    description:
      "Archivist stores the minimum data needed to preserve community highlights without keeping raw message history.",
    color: "violet",
  })
    .addFields(
      {
        name: "Stored Data",
        value: privacy.stored.map((entry) => `- ${entry}`).join("\n"),
        inline: false,
      },
      {
        name: "Anonymized or Redacted",
        value: privacy.anonymized.map((entry) => `- ${entry}`).join("\n"),
        inline: false,
      },
    );
}

async function resolveInspectableMessage(interaction) {
  const messageId = interaction.options.getString("message_id", true);
  const targetChannel = interaction.options.getChannel("channel") || interaction.channel;

  if (!targetChannel?.messages?.fetch) {
    throw new Error("The selected channel does not support message inspection.");
  }

  return targetChannel.messages.fetch(messageId);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("archivist")
    .setDescription("Manage highlights, recap delivery, privacy, and Archivist health")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((subcommand) =>
      subcommand.setName("overview").setDescription("Show the archivist overview"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("leaderboard")
        .setDescription("Show the highlight leaderboard"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("points")
        .setDescription("Show your points or another member's points")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("The member to inspect")
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("threshold")
        .setDescription("Set the reaction threshold used by scoring")
        .addIntegerOption((option) =>
          option
            .setName("value")
            .setDescription("Minimum reactions that count as full reaction weight")
            .setRequired(true)
            .setMinValue(1),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("autopost")
        .setDescription("Configure automatic highlight posting")
        .addBooleanOption((option) =>
          option
            .setName("enabled")
            .setDescription("Turn automatic highlight posting on or off")
            .setRequired(true),
        )
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Where automatic highlight posts should appear")
            .addChannelTypes(...ADMIN_CHANNEL_TYPES)
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("channel")
        .setDescription("Include, exclude, or reset a monitored channel")
        .addStringOption((option) =>
          option
            .setName("action")
            .setDescription("How the channel should be handled")
            .setRequired(true)
            .addChoices(
              { name: "Include", value: "include" },
              { name: "Exclude", value: "exclude" },
              { name: "Reset", value: "reset" },
            ),
        )
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel to update")
            .addChannelTypes(...ADMIN_CHANNEL_TYPES)
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("privacy")
        .setDescription("Show what data is stored and what is anonymized"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("health")
        .setDescription("Show runtime and database health"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("inspect")
        .setDescription("Inspect why a message was or was not highlighted")
        .addStringOption((option) =>
          option
            .setName("message_id")
            .setDescription("The Discord message ID to inspect")
            .setRequired(true),
        )
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel that contains the message")
            .addChannelTypes(...ADMIN_CHANNEL_TYPES)
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("weekly")
        .setDescription("Configure or post the weekly recap")
        .addStringOption((option) =>
          option
            .setName("action")
            .setDescription("Choose how to manage the weekly recap")
            .setRequired(true)
            .addChoices(
              { name: "Status", value: "status" },
              { name: "Enable", value: "enable" },
              { name: "Disable", value: "disable" },
              { name: "Post now", value: "post" },
            ),
        )
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Target channel for the recap")
            .addChannelTypes(...ADMIN_CHANNEL_TYPES)
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("motd")
        .setDescription("Manage Moment of the Day delivery")
        .addStringOption((option) =>
          option
            .setName("action")
            .setDescription("Choose how to manage the daily featured moment")
            .setRequired(true)
            .addChoices(
              { name: "Status", value: "status" },
              { name: "Enable", value: "enable" },
              { name: "Disable", value: "disable" },
              { name: "Post now", value: "post" },
            ),
        )
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Target channel for Moment of the Day")
            .addChannelTypes(...ADMIN_CHANNEL_TYPES)
            .setRequired(false),
        )
        .addIntegerOption((option) =>
          option
            .setName("hour")
            .setDescription("UTC hour when Archivist should post the daily moment")
            .setRequired(false)
            .setMinValue(0)
            .setMaxValue(23),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("backup")
        .setDescription("Create a backup of stored highlights"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("clear")
        .setDescription("Delete all stored highlight data"),
    ),

  async execute(interaction) {
    const archivist = interaction.client.archivist;
    const runtime = interaction.client.runtime;
    const subcommand = interaction.options.getSubcommand();

    try {
      switch (subcommand) {
        case "overview": {
          await interaction.reply({ embeds: [buildOverviewEmbed(interaction)], ephemeral: true });
          return;
        }

        case "leaderboard": {
          const leaderboard = archivist.getLeaderboard(10);
          const embed = createArchivistEmbed({
            title: "Highlight Leaderboard",
            description:
              "The community members whose messages have created the most saved moments.",
            color: "warm",
          });

          if (leaderboard.length === 0) {
            embed.addFields({
              name: "No data yet",
              value: "No highlight points have been recorded.",
              inline: false,
            });
          }

          leaderboard.forEach((user, index) => {
            embed.addFields({
              name: `Rank ${index + 1}`,
              value: `User ID suffix: ...${user.user_id.slice(-6)}\nPoints: ${user.points}`,
              inline: true,
            });
          });

          await interaction.reply({ embeds: [embed], ephemeral: true });
          return;
        }

        case "points": {
          const targetUser = interaction.options.getUser("user") || interaction.user;
          const userPoints = archivist.getUserPoints(targetUser.id);

          const embed = createArchivistEmbed({
            title: "Point Summary",
            description: "A quick view of current Archivist contribution points.",
          })
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
              },
            );

          await interaction.reply({ embeds: [embed], ephemeral: true });
          return;
        }

        case "threshold": {
          if (
            !(await requireAdministrator(
              interaction,
              "Only administrators can change highlight thresholds.",
            ))
          ) {
            return;
          }

          const value = interaction.options.getInteger("value", true);
          archivist.setReactionThreshold(value);

          await interaction.reply({
            embeds: [
              createArchivistEmbed({
                title: "Highlight Threshold Updated",
                description: `Archivist now treats ${value} reactions as full reaction weight in scoring.`,
                color: "success",
              }),
            ],
            ephemeral: true,
          });
          return;
        }

        case "autopost": {
          if (
            !(await requireAdministrator(
              interaction,
              "Only administrators can configure automatic highlight posting.",
            ))
          ) {
            return;
          }

          const enabled = interaction.options.getBoolean("enabled", true);
          const channel = interaction.options.getChannel("channel");
          const currentConfig = archivist.getAutoHighlightPostingConfig();
          const targetChannelId = channel?.id || currentConfig.channelId;

          if (enabled && !targetChannelId) {
            await interaction.reply({
              content: "Choose a channel before enabling automatic highlight posting.",
              ephemeral: true,
            });
            return;
          }

          archivist.setAutoHighlightPosting({
            enabled,
            channelId: targetChannelId,
          });

          await interaction.reply({
            embeds: [
              createArchivistEmbed({
                title: "Automatic Highlight Posting Updated",
                description: enabled
                  ? `New highlights will now be posted automatically in <#${targetChannelId}>.`
                  : "Automatic highlight posting is now disabled.",
                color: enabled ? "success" : "danger",
              }),
            ],
            ephemeral: true,
          });
          return;
        }

        case "channel": {
          if (
            !(await requireAdministrator(
              interaction,
              "Only administrators can change channel monitoring rules.",
            ))
          ) {
            return;
          }

          const action = interaction.options.getString("action", true);
          const channel = interaction.options.getChannel("channel", true);

          if (action === "reset") {
            archivist.removeChannelRule(channel.id);
          } else {
            archivist.setChannelRule(channel.id, action);
          }

          const embed = createArchivistEmbed({
            title: "Channel Monitoring Updated",
            description:
              action === "reset"
                ? `${channel} now follows the default monitoring policy again.`
                : `${channel} is now marked as ${action} for Archivist monitoring.`,
            color: "success",
          })
            .addFields({
              name: "Current Rules",
              value: formatChannelRules(archivist.getMonitoringSummary()),
              inline: false,
            });

          await interaction.reply({ embeds: [embed], ephemeral: true });
          return;
        }

        case "privacy": {
          await interaction.reply({
            embeds: [buildPrivacyEmbed(archivist)],
            ephemeral: true,
          });
          return;
        }

        case "health": {
          await interaction.reply({
            embeds: [buildHealthEmbed(interaction)],
            ephemeral: true,
          });
          return;
        }

        case "inspect": {
          if (
            !(await requireAdministrator(
              interaction,
              "Only administrators can inspect highlight decisions.",
            ))
          ) {
            return;
          }

          await interaction.deferReply({ ephemeral: true });
          const message = await resolveInspectableMessage(interaction);
          const inspection = await archivist.inspectMessage(message);

          const embed = createArchivistEmbed({
            title: "Highlight Decision",
            description:
              inspection.reason === "processed"
                ? "Here is the current scoring and storage decision for this message."
                : `Archivist did not process this message because ${inspection.reason.replace(/-/g, " ")}.`,
            color: inspection.isHighlight ? "success" : "warm",
          })
            .addFields(
              {
                name: "Message",
                value: trimText(message.content || message.id, 180),
                inline: false,
              },
              {
                name: "Decision",
                value: inspection.isHighlight ? "Saved as a highlight" : "Below highlight threshold",
                inline: true,
              },
              {
                name: "Stored",
                value: inspection.storedHighlight
                  ? inspection.storedHighlight.isHighlight
                    ? "Stored as highlight"
                    : "Stored but below highlight threshold"
                  : "Not stored",
                inline: true,
              },
              {
                name: "Score vs Threshold",
                value: `${inspection.highlightScore.toFixed(2)} / ${inspection.minScore.toFixed(2)}`,
                inline: true,
              },
              {
                name: "Reactions",
                value: `${inspection.reactionCount} / ${inspection.reactionThreshold}`,
                inline: true,
              },
              {
                name: "Reaction Contribution",
                value: inspection.contributions.reactions.toFixed(2),
                inline: true,
              },
              {
                name: "Sentiment Contribution",
                value: inspection.contributions.sentiment.toFixed(2),
                inline: true,
              },
              {
                name: "Keyword Contribution",
                value: inspection.contributions.keywords.toFixed(2),
                inline: true,
              },
              {
                name: "Monitoring",
                value: inspection.monitored ? "Included in monitoring" : "Not monitored",
                inline: true,
              },
            )
            .setFooter({
              text: message.url
                ? "Jump to the original message with the link below."
                : "Message link unavailable.",
            });

          if (message.url) {
            embed.addFields({
              name: "Jump To Message",
              value: `[Open in Discord](${message.url})`,
              inline: false,
            });
          }

          if (inspection.keywords.length > 0) {
            embed.addFields({
              name: "Matched Keywords",
              value: inspection.keywords.join(", "),
              inline: false,
            });
          }

          await interaction.editReply({ embeds: [embed] });
          return;
        }

        case "weekly": {
          if (
            !(await requireAdministrator(
              interaction,
              "Only administrators can manage weekly recaps.",
            ))
          ) {
            return;
          }

          const action = interaction.options.getString("action", true);
          const channel = interaction.options.getChannel("channel");
          await handleWeeklyAction(interaction, action, {
            channelId: channel?.id,
          });
          return;
        }

        case "motd": {
          if (
            !(await requireAdministrator(
              interaction,
              "Only administrators can manage Moment of the Day.",
            ))
          ) {
            return;
          }

          const action = interaction.options.getString("action", true);
          const channel = interaction.options.getChannel("channel");
          const hour = interaction.options.getInteger("hour");
          await handleMomentOfDayAction(interaction, action, {
            channelId: channel?.id,
            hour,
          });
          return;
        }

        case "backup": {
          if (
            !(await requireAdministrator(
              interaction,
              "Only administrators can create backups.",
            ))
          ) {
            return;
          }

          await interaction.deferReply({ ephemeral: true });

          const payload = {
            highlights: archivist.db
              .prepare("SELECT * FROM highlights_anonymized ORDER BY created_at DESC")
              .all(),
            settings: {
              reactionThreshold: archivist.getReactionThreshold(),
              monitoring: archivist.getMonitoringSummary(),
              weeklyRecap: archivist.getWeeklyRecapConfig(),
              autoHighlightPosting: archivist.getAutoHighlightPostingConfig(),
            },
            timestamp: new Date().toISOString(),
            version: 3,
          };

          const filePath = path.join(
            os.tmpdir(),
            `archivist-backup-${Date.now()}.json`,
          );
          await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");

          try {
            const dm = await interaction.user.createDM();
            await dm.send({
              embeds: [
                new EmbedBuilder()
                  .setTitle("Backup Ready")
                  .setDescription("Your archivist backup is attached.")
                  .setColor(0x16a34a)
                  .setTimestamp(),
              ],
              files: [new AttachmentBuilder(filePath)],
            });
            await interaction.editReply("Backup complete. The archive was sent by direct message.");
          } catch (error) {
            logger.error("Failed to deliver the backup by direct message.", error);
            await interaction.editReply(
              "The backup was created, but it could not be delivered by direct message.",
            );
          } finally {
            await fs.unlink(filePath).catch(() => {});
          }
          return;
        }

        case "clear": {
          if (
            !(await requireAdministrator(
              interaction,
              "Only administrators can clear archivist data.",
            ))
          ) {
            return;
          }

          archivist.db.exec("DELETE FROM highlights_anonymized");
          archivist.db.exec("DELETE FROM user_points");
          archivist.db.exec("DELETE FROM user_privacy");
          archivist.db.exec("DELETE FROM app_settings");
          archivist.db.exec("DELETE FROM channel_settings");

          const embed = createArchivistEmbed({
            title: "Data Cleared",
            description: "All Archivist data and configuration have been deleted.",
            color: "danger",
          });

          await interaction.reply({ embeds: [embed], ephemeral: true });
          return;
        }

        default:
          await interaction.reply({
            content: "Unknown archivist subcommand.",
            ephemeral: true,
          });
      }
    } catch (error) {
      logger.error("Failed to execute an archivist command.", error);
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({
          content: "The archivist command failed.",
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: "The archivist command failed.",
          ephemeral: true,
        });
      }
    }
  },

  async handleComponent(interaction) {
    if (!interaction.isButton()) {
      return false;
    }

    let action;
    let ownerId;
    let handler;
    let title = "Archivist Controls";

    if (interaction.customId.startsWith(`${MOTD_CONTROL_PREFIX}:`)) {
      [action, ownerId] = interaction.customId
        .slice(`${MOTD_CONTROL_PREFIX}:`.length)
        .split(":");
      handler = handleMomentOfDayAction;
      title = "Archivist MOTD Controls";
    } else if (interaction.customId.startsWith(`${WEEKLY_CONTROL_PREFIX}:`)) {
      [action, ownerId] = interaction.customId
        .slice(`${WEEKLY_CONTROL_PREFIX}:`.length)
        .split(":");
      handler = handleWeeklyAction;
      title = "Archivist Weekly Controls";
    } else {
      return false;
    }

    if (interaction.user.id !== ownerId) {
      await interaction.reply({
        embeds: [
          createArchivistEmbed({
            title,
            description: "This control panel belongs to another user.",
            color: "danger",
          }),
        ],
        ephemeral: true,
      });
      return true;
    }

    if (!isAdministrator(interaction)) {
      await interaction.reply({
        content: "Only administrators can manage Moment of the Day.",
        ephemeral: true,
      });
      return true;
    }

    return handler(interaction, action);
  },
};
