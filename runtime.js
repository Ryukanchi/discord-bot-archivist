const { createArchivistEmbed, trimText } = require("./embed-style.js");

function createMessageQueue() {
  const inFlight = new Map();

  async function run(messageId, task) {
    if (!messageId) {
      return task();
    }

    const previousTask = inFlight.get(messageId) || Promise.resolve();
    const nextTask = previousTask
      .catch(() => {})
      .then(task)
      .finally(() => {
        if (inFlight.get(messageId) === nextTask) {
          inFlight.delete(messageId);
        }
      });

    inFlight.set(messageId, nextTask);
    return nextTask;
  }

  return { run, size: () => inFlight.size };
}

function isIgnorableDiscordError(error) {
  return error?.code === 10008 || error?.status === 404;
}

function createRuntime({ archivist, logger }) {
  const queue = createMessageQueue();
  let weeklyRecapTimer = null;
  const health = {
    lastProcessedEvent: "none",
    recentErrorCount: 0,
    processedEvents: 0,
  };

  function markSuccess(eventName) {
    health.lastProcessedEvent = eventName;
    health.processedEvents += 1;
  }

  function markError(eventName) {
    health.lastProcessedEvent = `${eventName}:error`;
    health.recentErrorCount += 1;
  }

  async function hydrateEntity(entity, label) {
    if (!entity?.partial) {
      return entity;
    }

    try {
      return await entity.fetch();
    } catch (error) {
      if (!isIgnorableDiscordError(error)) {
        logger.warn(`Failed to hydrate partial ${label}.`, error);
        markError(`hydrate-${label}`);
      }
      return null;
    }
  }

  async function maybePostHighlight(client, message, analysis) {
    const config = archivist.getAutoHighlightPostingConfig();
    if (!config.enabled || !config.channelId) {
      return false;
    }

    try {
      const targetChannel = await client.channels.fetch(config.channelId);
      if (!targetChannel?.isTextBased?.()) {
        logger.warn("Auto-highlight posting is enabled, but the target channel is unavailable.");
        return false;
      }

      const embed = createArchivistEmbed({
        title: "A Moment Worth Revisiting",
        description: trimText(message.content, 320),
        color: "warm",
      })
        .addFields(
          {
            name: "From",
            value: message.author ? `<@${message.author.id}>` : "Unknown user",
            inline: true,
          },
          {
            name: "Highlight Score",
            value: analysis.highlightScore.toFixed(2),
            inline: true,
          },
          {
            name: "Reactions",
            value: String(analysis.reactionCount),
            inline: true,
          },
          {
            name: "Channel",
            value: message.channel?.id ? `<#${message.channel.id}>` : "Unknown channel",
            inline: true,
          },
        );

      if (message.createdTimestamp) {
        embed.addFields({
          name: "Original Time",
          value: `<t:${Math.floor(message.createdTimestamp / 1000)}:f>`,
          inline: true,
        });
      }

      if (message.url) {
        embed.addFields({
          name: "Jump To Message",
          value: `[Open in Discord](${message.url})`,
          inline: false,
        });
      }

      await targetChannel.send({ embeds: [embed] });
      return true;
    } catch (error) {
      logger.error("Failed to post an automatic highlight.", error);
      markError("auto-highlight-post");
      return false;
    }
  }

  async function processMessage(message, source, client = null) {
    const resolvedMessage = await hydrateEntity(message, "message");
    if (!resolvedMessage?.id) {
      return null;
    }

    return queue.run(resolvedMessage.id, async () => {
      try {
        const analysis = await archivist.recordMessage(resolvedMessage);
        markSuccess(source);

        if (analysis.becameHighlight) {
          logger.info(
            `Promoted message ${resolvedMessage.id} from user ${resolvedMessage.author?.id} to a highlight.`,
          );
          if (client) {
            await maybePostHighlight(client, resolvedMessage, analysis);
          }
        }

        if (analysis.lostHighlight) {
          logger.info(
            `Demoted message ${resolvedMessage.id} from user ${resolvedMessage.author?.id}.`,
          );
        }

        return analysis;
      } catch (error) {
        logger.error(`Failed to process a message from ${source}.`, error);
        markError(source);
        return null;
      }
    });
  }

  async function processReaction(reaction, user, source, client = null) {
    if (user?.bot) {
      return null;
    }

    const resolvedReaction = await hydrateEntity(reaction, "reaction");
    if (!resolvedReaction?.message) {
      return null;
    }

    return processMessage(resolvedReaction.message, source, client);
  }

  async function processDeletion(message, source) {
    const messageId = message?.id;
    if (!messageId) {
      return null;
    }

    return queue.run(messageId, async () => {
      try {
        const removal = archivist.removeStoredMessage(messageId);
        markSuccess(source);
        if (removal.removedHighlight) {
          logger.info(`Removed stored highlight state for deleted message ${messageId}.`);
        }
        return removal;
      } catch (error) {
        logger.error(`Failed to process a deletion event from ${source}.`, error);
        markError(source);
        return null;
      }
    });
  }

  async function processBulkDeletion(messages) {
    const removals = [];
    for (const message of messages.values()) {
      removals.push(await processDeletion(message, "messageDeleteBulk"));
    }
    return removals;
  }

  async function processUpdate(_oldMessage, newMessage, client = null) {
    return processMessage(newMessage, "messageUpdate", client);
  }

  async function dispatchWeeklyRecap(client, source = "weekly-recap") {
    const config = archivist.getWeeklyRecapConfig();
    if (!config.enabled || !config.channelId) {
      return false;
    }

    try {
      const report = archivist.generateWeeklyReport();
      const targetChannel = await client.channels.fetch(config.channelId);
      if (!targetChannel?.isTextBased?.()) {
        logger.warn("Weekly recap is enabled, but the recap channel is unavailable.");
        return false;
      }

      const lines =
        report.highlights.length > 0
          ? report.highlights.slice(0, 3).map(
              (highlight, index) =>
                `${index + 1}. ${trimText(highlight.anonymized_content, 120)} (${highlight.reaction_count} reactions)`,
            )
          : [];

      const topHighlight = report.highlights[0];
      const hiddenGem = report.highlights[1];

      const embed = createArchivistEmbed({
        title: "Archivist Weekly Recap",
        description:
          "A look back at the community moments worth revisiting from the last seven days.",
      })
        .addFields(
          {
            name: "Community Snapshot",
            value: `${report.totalHighlights} saved highlight${report.totalHighlights === 1 ? "" : "s"}`,
            inline: true,
          },
          {
            name: "Week",
            value: `${report.startDate.toLocaleDateString()} - ${report.endDate.toLocaleDateString()}`,
            inline: true,
          },
          {
            name: "Top Highlight",
            value: topHighlight
              ? trimText(topHighlight.anonymized_content, 220)
              : "No highlights reached the recap this week.",
            inline: false,
          },
        );

      if (topHighlight) {
        embed.addFields({
          name: "Most Loved Moment",
          value: `${topHighlight.reaction_count} reactions and a sentiment score of ${topHighlight.sentiment_score.toFixed(2)}.`,
          inline: false,
        });
      }

      if (hiddenGem) {
        embed.addFields({
          name: "Worth Revisiting",
          value: trimText(hiddenGem.anonymized_content, 180),
          inline: false,
        });
      }

      if (lines.length > 0) {
        embed.addFields({
          name: "More From This Week",
          value: lines.join("\n"),
          inline: false,
        });
      }

      await targetChannel.send({ embeds: [embed] });
      archivist.markWeeklyRecapSent();
      logger.info(`Posted a weekly recap via ${source}.`);
      markSuccess(source);
      return true;
    } catch (error) {
      logger.error("Failed to post the weekly recap.", error);
      markError(source);
      return false;
    }
  }

  async function dispatchMomentOfDay(client, source = "moment-of-the-day", options = {}) {
    const config = archivist.getMomentOfDayConfig();
    const force = options.force === true;
    if ((!config.enabled && !force) || !config.channelId) {
      return false;
    }

    try {
      const candidate = archivist.getMomentOfDayCandidate();
      if (!candidate) {
        return false;
      }

      const targetChannel = await client.channels.fetch(config.channelId);
      if (!targetChannel?.isTextBased?.()) {
        logger.warn("Moment of the Day is enabled, but the target channel is unavailable.");
        return false;
      }

      const embed = createArchivistEmbed({
        title: "✨ Moment of the Day",
        description: "A moment worth revisiting",
        color: "warm",
      }).addFields(
        {
          name: "Featured Message",
          value: trimText(candidate.anonymized_content, 320),
          inline: false,
        },
        {
          name: "Author",
          value: `Archived author ...${candidate.hashed_author_id.slice(-6)}`,
          inline: true,
        },
        {
          name: "Channel",
          value: candidate.channel_type || "Unknown channel",
          inline: true,
        },
        {
          name: "Reactions",
          value: String(candidate.reaction_count),
          inline: true,
        },
        {
          name: "Highlight Score",
          value: candidate.highlightScore.toFixed(2),
          inline: true,
        },
        {
          name: "Original Time",
          value: `<t:${Math.floor(new Date(candidate.created_at).getTime() / 1000)}:f>`,
          inline: true,
        },
      );

      await targetChannel.send({ embeds: [embed] });
      archivist.markMomentOfDaySent(candidate.hashed_message_id);
      logger.info(`Posted Moment of the Day via ${source}.`);
      markSuccess(source);
      return true;
    } catch (error) {
      logger.error("Failed to post Moment of the Day.", error);
      markError(source);
      return false;
    }
  }

  function startBackgroundJobs(client) {
    if (weeklyRecapTimer) {
      clearInterval(weeklyRecapTimer);
    }

    const maybeSendWeeklyRecap = async () => {
      if (archivist.shouldSendWeeklyRecap()) {
        await dispatchWeeklyRecap(client, "weekly-recap-scheduler");
      }
    };

    const maybeSendMomentOfDay = async () => {
      if (archivist.shouldSendMomentOfDay()) {
        await dispatchMomentOfDay(client, "moment-of-the-day-scheduler");
      }
    };

    weeklyRecapTimer = setInterval(() => {
      void maybeSendWeeklyRecap();
      void maybeSendMomentOfDay();
    }, 60 * 60 * 1000);
    weeklyRecapTimer.unref?.();
  }

  function stopBackgroundJobs() {
    if (weeklyRecapTimer) {
      clearInterval(weeklyRecapTimer);
      weeklyRecapTimer = null;
    }
  }

  function getHealthSnapshot() {
    return {
      ...health,
      queueDepth: queue.size(),
    };
  }

  function registerEventHandlers(client) {
    client.on("messageCreate", async (message) => {
      await processMessage(message, "messageCreate", client);
    });

    client.on("messageUpdate", async (oldMessage, newMessage) => {
      await processUpdate(oldMessage, newMessage, client);
    });

    client.on("messageReactionAdd", async (reaction, user) => {
      await processReaction(reaction, user, "messageReactionAdd", client);
    });

    client.on("messageReactionRemove", async (reaction, user) => {
      await processReaction(reaction, user, "messageReactionRemove", client);
    });

    client.on("messageDelete", async (message) => {
      await processDeletion(message, "messageDelete");
    });

    client.on("messageDeleteBulk", async (messages) => {
      await processBulkDeletion(messages);
    });

    client.once("ready", () => {
      startBackgroundJobs(client);
    });
  }

  return {
    dispatchMomentOfDay,
    dispatchWeeklyRecap,
    getHealthSnapshot,
    processBulkDeletion,
    processDeletion,
    processMessage,
    processReaction,
    processUpdate,
    queue,
    registerEventHandlers,
    startBackgroundJobs,
    stopBackgroundJobs,
  };
}

module.exports = {
  createRuntime,
  createMessageQueue,
};
