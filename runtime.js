const { createArchivistEmbed, trimText } = require("./embed-style.js");
const {
  getGuildId,
  isAllowedGuildEntity,
  isAllowedGuildId,
} = require("./guild-scope.js");

const MESSAGE_REFRESH_MAX_CONCURRENT = 4;
const MESSAGE_REFRESH_MAX_MESSAGES = 256;
const MESSAGE_REFRESH_WARNING_INTERVAL_MS = 60 * 1000;

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

function createMessageRefreshQueue({
  maxConcurrent = MESSAGE_REFRESH_MAX_CONCURRENT,
  maxMessages = MESSAGE_REFRESH_MAX_MESSAGES,
} = {}) {
  if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1) {
    throw new TypeError(
      "Message refresh concurrency must be a positive integer.",
    );
  }
  if (!Number.isInteger(maxMessages) || maxMessages < maxConcurrent) {
    throw new TypeError(
      "Message refresh capacity must be an integer at least as large as its concurrency.",
    );
  }

  const entries = new Map();
  const pending = [];
  let active = 0;
  let coalesced = 0;
  let dropped = 0;

  function createSlot(task) {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    return { task, promise, resolve, reject, started: false };
  }

  function drain() {
    while (active < maxConcurrent && pending.length > 0) {
      const { entry, slot } = pending.shift();
      if (entry.current !== slot || slot.started || slot.cancelled) {
        continue;
      }

      slot.started = true;
      active += 1;
      void (async () => {
        let result;
        let failure;
        let failed = false;
        try {
          result = await slot.task({
            isCancelled: () => slot.cancelled === true,
          });
        } catch (error) {
          failure = error;
          failed = true;
        } finally {
          active -= 1;
          if (entry.current === slot) {
            if (entry.next) {
              entry.current = entry.next;
              entry.next = null;
              pending.push({ entry, slot: entry.current });
            } else {
              entries.delete(entry.messageId);
            }
          }
          drain();
        }

        if (slot.cancelled) {
          slot.resolve(null);
        } else if (failed) {
          slot.reject(failure);
        } else {
          slot.resolve(result);
        }
      })();
    }
  }

  function run(messageId, task) {
    if (!messageId || typeof task !== "function") {
      throw new TypeError(
        "Message refresh work requires a message ID and task.",
      );
    }

    const existing = entries.get(messageId);
    if (existing) {
      coalesced += 1;
      if (!existing.current.started) {
        existing.current.task = task;
        return existing.current.promise;
      }

      if (!existing.next) {
        existing.next = createSlot(task);
      } else {
        existing.next.task = task;
      }
      return existing.next.promise;
    }

    if (entries.size >= maxMessages) {
      dropped += 1;
      return null;
    }

    const entry = {
      messageId,
      current: createSlot(task),
      next: null,
    };
    entries.set(messageId, entry);
    pending.push({ entry, slot: entry.current });
    drain();
    return entry.current.promise;
  }

  function cancel(messageId) {
    const entry = entries.get(messageId);
    if (!entry) {
      return false;
    }

    if (entry.next) {
      entry.next.cancelled = true;
      entry.next.resolve(null);
      entry.next = null;
    }

    entry.current.cancelled = true;
    if (!entry.current.started) {
      const pendingIndex = pending.findIndex(
        (item) => item.entry === entry && item.slot === entry.current,
      );
      if (pendingIndex >= 0) {
        pending.splice(pendingIndex, 1);
      }
      entries.delete(messageId);
      entry.current.resolve(null);
    }
    return true;
  }

  return {
    cancel,
    run,
    size: () => entries.size,
    getStats: () => ({
      active,
      coalesced,
      dropped,
      pending: pending.length,
      trackedMessages: entries.size,
    }),
  };
}

function isIgnorableDiscordError(error) {
  return error?.code === 10008 || error?.status === 404;
}

function createRuntime({
  archivist,
  logger,
  allowedGuildId = archivist.allowedGuildId,
}) {
  if (
    !archivist?.allowedGuildId ||
    allowedGuildId !== archivist.allowedGuildId
  ) {
    throw new Error(
      "Runtime guild scope must match the database-bound Archivist guild.",
    );
  }

  const queue = createMessageQueue();
  const refreshQueue = createMessageRefreshQueue();
  let lastRefreshQueueWarningAt = 0;
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

  function submitMessageRefresh(messageId, source, task) {
    const queued = refreshQueue.run(messageId, async (control) => {
      try {
        return await task(control);
      } catch (error) {
        logger.error(`Failed to refresh a message from ${source}.`, error);
        markError(source);
        return null;
      }
    });

    if (queued) {
      return queued;
    }

    const now = Date.now();
    if (
      now - lastRefreshQueueWarningAt >=
      MESSAGE_REFRESH_WARNING_INTERVAL_MS
    ) {
      lastRefreshQueueWarningAt = now;
      logger.warn(
        "Dropped a message refresh because the bounded refresh queue is full.",
      );
    }
    return null;
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

    if (!message.channel?.id || message.channel.id !== config.channelId) {
      logger.warn(
        "Skipped automatic highlight delivery because the configured target differs from the source channel.",
      );
      return false;
    }

    try {
      const targetChannel = await client.channels.fetch(config.channelId);
      if (
        targetChannel?.id !== config.channelId ||
        !targetChannel?.isTextBased?.() ||
        !isAllowedGuildEntity(targetChannel, allowedGuildId)
      ) {
        logger.warn(
          "Auto-highlight posting is enabled, but the target channel is unavailable.",
        );
        return false;
      }

      const embed = createArchivistEmbed({
        title: "A Moment Worth Revisiting",
        description: trimText(message.content, 320),
        color: "warm",
      }).addFields(
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
          value: message.channel?.id
            ? `<#${message.channel.id}>`
            : "Unknown channel",
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

  async function processMessage(
    message,
    source,
    client = null,
    { shouldProcess = null } = {},
  ) {
    const knownGuildId = getGuildId(message);
    if (knownGuildId && !isAllowedGuildId(knownGuildId, allowedGuildId)) {
      return archivist.createEmptyAnalysis({
        reason: "guild-not-allowed",
        monitored: false,
      });
    }

    const resolvedMessage = await hydrateEntity(message, "message");
    if (!resolvedMessage?.id) {
      return null;
    }

    if (!isAllowedGuildEntity(resolvedMessage, allowedGuildId)) {
      return archivist.createEmptyAnalysis({
        reason: "guild-not-allowed",
        monitored: false,
      });
    }

    return queue.run(resolvedMessage.id, async () => {
      if (shouldProcess && !shouldProcess()) {
        return null;
      }

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

  function processReaction(reaction, user, source, client = null) {
    if (user?.bot) {
      return null;
    }

    const knownGuildId = getGuildId(reaction?.message);
    if (knownGuildId && !isAllowedGuildId(knownGuildId, allowedGuildId)) {
      return archivist.createEmptyAnalysis({
        reason: "guild-not-allowed",
        monitored: false,
      });
    }

    function submit(messageId, hydratedReaction = null) {
      return submitMessageRefresh(
        messageId,
        source,
        async ({ isCancelled }) => {
          const currentReaction =
            hydratedReaction || (await hydrateEntity(reaction, "reaction"));
          if (!currentReaction?.message || isCancelled()) {
            return null;
          }
          return await processMessage(currentReaction.message, source, client, {
            shouldProcess: () => !isCancelled(),
          });
        },
      );
    }

    const messageId = reaction?.message?.id;
    if (messageId) {
      return submit(messageId);
    }

    return hydrateEntity(reaction, "reaction").then((resolvedReaction) => {
      const resolvedMessageId = resolvedReaction?.message?.id;
      return resolvedMessageId
        ? submit(resolvedMessageId, resolvedReaction)
        : null;
    });
  }

  async function processDeletion(message, source) {
    const messageId = message?.id;
    if (!messageId) {
      return null;
    }

    if (!isAllowedGuildEntity(message, allowedGuildId)) {
      return null;
    }

    refreshQueue.cancel(messageId);

    return queue.run(messageId, async () => {
      try {
        const removal = archivist.removeStoredMessage(messageId);
        markSuccess(source);
        if (removal.removedHighlight) {
          logger.info(
            `Removed stored highlight state for deleted message ${messageId}.`,
          );
        }
        return removal;
      } catch (error) {
        logger.error(
          `Failed to process a deletion event from ${source}.`,
          error,
        );
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

  function processUpdate(_oldMessage, newMessage, client = null) {
    const knownGuildId = getGuildId(newMessage);
    if (knownGuildId && !isAllowedGuildId(knownGuildId, allowedGuildId)) {
      return archivist.createEmptyAnalysis({
        reason: "guild-not-allowed",
        monitored: false,
      });
    }

    if (!newMessage?.id) {
      return processMessage(newMessage, "messageUpdate", client);
    }

    return submitMessageRefresh(
      newMessage.id,
      "messageUpdate",
      async ({ isCancelled }) => {
        if (isCancelled()) {
          return null;
        }
        return processMessage(newMessage, "messageUpdate", client, {
          shouldProcess: () => !isCancelled(),
        });
      },
    );
  }

  async function dispatchWeeklyRecap(
    client,
    source = "weekly-recap",
    options = {},
  ) {
    const config = archivist.getWeeklyRecapConfig();
    const force = options.force === true;
    if ((!config.enabled && !force) || !config.channelId) {
      return false;
    }

    try {
      const targetChannel = await client.channels.fetch(config.channelId);
      if (
        targetChannel?.id !== config.channelId ||
        !targetChannel?.isTextBased?.() ||
        !isAllowedGuildEntity(targetChannel, allowedGuildId)
      ) {
        logger.warn(
          "Weekly recap is enabled, but the recap channel is unavailable.",
        );
        return false;
      }
      const report = archivist.generateWeeklyReport(
        undefined,
        targetChannel.id,
      );

      const lines =
        report.highlights.length > 0
          ? report.highlights
              .slice(0, 3)
              .map(
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
      }).addFields(
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

  async function dispatchMomentOfDay(
    client,
    source = "moment-of-the-day",
    options = {},
  ) {
    const config = archivist.getMomentOfDayConfig();
    const force = options.force === true;
    if ((!config.enabled && !force) || !config.channelId) {
      return false;
    }

    try {
      const targetChannel = await client.channels.fetch(config.channelId);
      if (
        targetChannel?.id !== config.channelId ||
        !targetChannel?.isTextBased?.() ||
        !isAllowedGuildEntity(targetChannel, allowedGuildId)
      ) {
        logger.warn(
          "Moment of the Day is enabled, but the target channel is unavailable.",
        );
        return false;
      }
      const candidate = archivist.getMomentOfDayCandidate(
        undefined,
        targetChannel.id,
      );
      if (!candidate) {
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

    weeklyRecapTimer = setInterval(
      () => {
        void maybeSendWeeklyRecap();
        void maybeSendMomentOfDay();
      },
      60 * 60 * 1000,
    );
    weeklyRecapTimer.unref?.();
  }

  function stopBackgroundJobs() {
    if (weeklyRecapTimer) {
      clearInterval(weeklyRecapTimer);
      weeklyRecapTimer = null;
    }
  }

  function getHealthSnapshot() {
    const refreshQueueHealth = refreshQueue.getStats();
    return {
      ...health,
      queueDepth: queue.size(),
      messageRefreshQueueDepth: refreshQueueHealth.trackedMessages,
      messageRefreshQueueActive: refreshQueueHealth.active,
      messageRefreshQueuePending: refreshQueueHealth.pending,
      messageRefreshesCoalesced: refreshQueueHealth.coalesced,
      messageRefreshesDropped: refreshQueueHealth.dropped,
    };
  }

  function registerEventHandlers(client) {
    client.on("messageCreate", async (message) => {
      await processMessage(message, "messageCreate", client);
    });

    client.on("messageUpdate", (oldMessage, newMessage) => {
      void processUpdate(oldMessage, newMessage, client);
    });

    client.on("messageReactionAdd", (reaction, user) => {
      void processReaction(reaction, user, "messageReactionAdd", client);
    });

    client.on("messageReactionRemove", (reaction, user) => {
      void processReaction(reaction, user, "messageReactionRemove", client);
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
    refreshQueue,
    registerEventHandlers,
    startBackgroundJobs,
    stopBackgroundJobs,
  };
}

module.exports = {
  createRuntime,
  createMessageQueue,
  createMessageRefreshQueue,
};
