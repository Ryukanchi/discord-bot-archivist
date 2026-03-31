const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");

const ServerArchivist = require("./archivist.js");
const { createRuntime } = require("./runtime.js");

function restoreEnv(previousEnv) {
  for (const [key, value] of Object.entries(previousEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function createReactionCache(totalCount) {
  return new Map([["default", { count: totalCount }]]);
}

function createUser(overrides = {}) {
  return {
    id: overrides.id || "user-1",
    username: overrides.username || "ArchivistUser",
    bot: overrides.bot || false,
    createDM: overrides.createDM || (async () => ({ send: async () => {} })),
  };
}

function createChannel(overrides = {}) {
  return {
    id: overrides.id || "channel-1",
    type: overrides.type || "GuildText",
    name: overrides.name || "general",
    messages:
      overrides.messages ||
      ({
        async fetch(messageId) {
          return buildMessage({ id: messageId });
        },
      }),
  };
}

function createGuild(overrides = {}) {
  return {
    id: overrides.id || "guild-1",
    name: overrides.name || "Archivist Guild",
  };
}

function buildMessage(overrides = {}) {
  return {
    id: overrides.id || "message-1",
    content: overrides.content || "wow this archivist test should pop off",
    author: overrides.author || createUser(),
    channel: overrides.channel || createChannel(),
    guild: overrides.guild || createGuild(),
    reactions: overrides.reactions || { cache: createReactionCache(0) },
    partial: overrides.partial || false,
    fetch:
      overrides.fetch ||
      (async function fetch() {
        return { ...this, partial: false };
      }),
  };
}

function withArchivistEnvironment() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "archivist-test-"));
  const previousEnv = {
    DATABASE_PATH: process.env.DATABASE_PATH,
    PRIVACY_SALT: process.env.PRIVACY_SALT,
    MIN_SCORE: process.env.MIN_SCORE,
    KEYWORDS: process.env.KEYWORDS,
    AUTO_DELETE_ENABLED: process.env.AUTO_DELETE_ENABLED,
    MOTD_ENABLED: process.env.MOTD_ENABLED,
    MOTD_CHANNEL_ID: process.env.MOTD_CHANNEL_ID,
    MOTD_POST_HOUR: process.env.MOTD_POST_HOUR,
  };

  process.env.DATABASE_PATH = path.join(tempDir, "highlights.db");
  process.env.PRIVACY_SALT = "fixed-test-salt";
  process.env.MIN_SCORE = "0.2";
  process.env.KEYWORDS = "wow,test";
  process.env.AUTO_DELETE_ENABLED = "false";
  process.env.MOTD_ENABLED = "true";
  process.env.MOTD_CHANNEL_ID = "motd-channel";
  process.env.MOTD_POST_HOUR = "12";

  return {
    tempDir,
    cleanup() {
      restoreEnv(previousEnv);
      fs.rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

async function grantConsent(archivist, userId = "user-1") {
  await archivist.setUserConsent(userId, true);
}

test("persists the privacy salt with owner-only permissions", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "archivist-salt-"));
  const previousEnv = {
    DATABASE_PATH: process.env.DATABASE_PATH,
    PRIVACY_SALT: process.env.PRIVACY_SALT,
  };

  process.env.DATABASE_PATH = path.join(tempDir, "salt-test.db");
  delete process.env.PRIVACY_SALT;

  const archivist = new ServerArchivist();
  const saltFilePath = path.join(tempDir, ".privacy_salt");
  const generatedSalt = archivist.privacySalt;
  archivist.close();

  assert.equal(fs.existsSync(saltFilePath), true);
  assert.equal(fs.readFileSync(saltFilePath, "utf8").trim(), generatedSalt);

  if (process.platform !== "win32") {
    const mode = fs.statSync(saltFilePath).mode & 0o777;
    assert.equal(mode, 0o600);
  }

  const reopenedArchivist = new ServerArchivist();
  assert.equal(reopenedArchivist.privacySalt, generatedSalt);
  reopenedArchivist.close();

  restoreEnv(previousEnv);
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("records a highlight once and keeps point totals stable across repeated processing", async () => {
  const env = withArchivistEnvironment();
  const archivist = new ServerArchivist();
  const message = buildMessage({
    content: "wow first draft of the highlight",
    reactions: { cache: createReactionCache(5) },
  });

  const firstResult = await archivist.recordMessage(message, {
    bypassConsent: true,
  });
  const secondResult = await archivist.recordMessage(message, {
    bypassConsent: true,
  });

  const rows = archivist.db
    .prepare("SELECT * FROM highlights_anonymized WHERE hashed_message_id = ?")
    .all(archivist.hashUserId(message.id));
  const points = archivist.getUserPoints(message.author.id);

  assert.equal(firstResult.becameHighlight, true);
  assert.equal(secondResult.becameHighlight, false);
  assert.equal(rows.length, 1);
  assert.equal(points.points, 10);
  assert.equal(points.highlights_created, 1);

  archivist.close();
  env.cleanup();
});

test("revokes points when a highlight falls below the threshold", async () => {
  const env = withArchivistEnvironment();
  const archivist = new ServerArchivist();
  const messageId = "message-demotion";

  await archivist.recordMessage(
    buildMessage({
      id: messageId,
      content: "wow initial highlight",
      reactions: { cache: createReactionCache(5) },
    }),
    { bypassConsent: true },
  );

  const demotion = await archivist.recordMessage(
    buildMessage({
      id: messageId,
      content: "plain follow-up",
      reactions: { cache: createReactionCache(0) },
    }),
    { bypassConsent: true },
  );

  const points = archivist.getUserPoints("user-1");
  assert.equal(demotion.lostHighlight, true);
  assert.equal(points.points, 0);
  assert.equal(points.highlights_created, 0);

  archivist.close();
  env.cleanup();
});

test("removes stored highlights and adjusts points after message deletion", async () => {
  const env = withArchivistEnvironment();
  const archivist = new ServerArchivist();
  const message = buildMessage({
    id: "message-delete",
    content: "wow this should be deleted later",
    reactions: { cache: createReactionCache(4) },
  });

  await archivist.recordMessage(message, { bypassConsent: true });
  const removal = archivist.removeStoredMessage(message.id);
  const rows = archivist.db
    .prepare("SELECT * FROM highlights_anonymized WHERE hashed_message_id = ?")
    .all(archivist.hashUserId(message.id));

  assert.equal(removal.removed, true);
  assert.equal(removal.removedHighlight, true);
  assert.equal(rows.length, 0);
  assert.equal(archivist.getUserPoints(message.author.id).points, 0);

  archivist.close();
  env.cleanup();
});

test("respects SQLite boolean consent values and keeps email anonymization intact", async () => {
  const env = withArchivistEnvironment();
  const archivist = new ServerArchivist();
  const user = createUser({ id: "consenting-user", username: "Consent" });

  archivist.db
    .prepare("INSERT INTO user_privacy (user_id, consent) VALUES (?, ?)")
    .run(archivist.hashUserId(user.id), 1);

  const result = await archivist.analyzeMessage(
    buildMessage({
      id: "consent-message",
      author: user,
      content: "email me at bob@example.com and ping @Alice",
    }),
  );

  const anonymized = archivist.anonymizeContent(
    "email me at bob@example.com and ping @Alice",
  );

  assert.equal(result.reason, "processed");
  assert.equal(anonymized.includes("[EMAIL]"), true);
  assert.equal(anonymized.includes("bob@[USER].com"), false);
  assert.equal(anonymized.includes("@[USER]"), true);

  archivist.close();
  env.cleanup();
});

test("keeps preview analysis side-effect free", async () => {
  const env = withArchivistEnvironment();
  const archivist = new ServerArchivist();
  const preview = await archivist.analyzeMessage(
    buildMessage({
      id: "preview-message",
      content: "wow preview only",
      reactions: { cache: createReactionCache(8) },
    }),
    { bypassConsent: true },
  );

  const rows = archivist.db.prepare("SELECT * FROM highlights_anonymized").all();
  assert.equal(preview.isHighlight, true);
  assert.equal(rows.length, 0);

  archivist.close();
  env.cleanup();
});

test("respects include and exclude channel rules when scoring messages", async () => {
  const env = withArchivistEnvironment();
  const archivist = new ServerArchivist();
  const includedChannel = createChannel({ id: "channel-included" });
  const excludedChannel = createChannel({ id: "channel-excluded" });

  archivist.setChannelRule(includedChannel.id, "include");
  archivist.setChannelRule(excludedChannel.id, "exclude");

  const ignored = await archivist.recordMessage(
    buildMessage({
      id: "message-excluded",
      channel: excludedChannel,
      content: "wow this should stay out of storage",
      reactions: { cache: createReactionCache(5) },
    }),
    { bypassConsent: true },
  );

  const accepted = await archivist.recordMessage(
    buildMessage({
      id: "message-included",
      channel: includedChannel,
      content: "wow this should be monitored",
      reactions: { cache: createReactionCache(5) },
    }),
    { bypassConsent: true },
  );

  assert.equal(ignored.reason, "channel-not-monitored");
  assert.equal(accepted.isHighlight, true);
  assert.equal(archivist.getHighlightCount(), 1);

  archivist.close();
  env.cleanup();
});

test("uses the configured reaction threshold in highlight scoring", async () => {
  const env = withArchivistEnvironment();
  const archivist = new ServerArchivist();
  archivist.setReactionThreshold(8);

  const lowReactionAnalysis = await archivist.analyzeMessage(
    buildMessage({
      id: "threshold-message",
      content: "wow threshold test",
      reactions: { cache: createReactionCache(4) },
    }),
    { bypassConsent: true },
  );

  assert.equal(lowReactionAnalysis.reactionThreshold, 8);
  assert.equal(lowReactionAnalysis.contributions.reactions < 0.3, true);

  archivist.close();
  env.cleanup();
});

test("serializes runtime work per message in a high-traffic scenario", async () => {
  const env = withArchivistEnvironment();
  const archivist = new ServerArchivist();
  await grantConsent(archivist);
  const logs = [];
  const runtime = createRuntime({
    archivist,
    logger: {
      info(message) {
        logs.push(message);
      },
      warn() {},
      error() {},
    },
  });

  const hotMessage = buildMessage({
    id: "hot-message",
    content: "wow high traffic highlight",
    reactions: { cache: createReactionCache(10) },
  });

  await Promise.all(
    Array.from({ length: 25 }, () =>
      runtime.processMessage({ ...hotMessage }, "stress test"),
    ),
  );

  const rows = archivist.db
    .prepare("SELECT * FROM highlights_anonymized WHERE hashed_message_id = ?")
    .all(archivist.hashUserId(hotMessage.id));
  const points = archivist.getUserPoints(hotMessage.author.id);

  assert.equal(rows.length, 1);
  assert.equal(points.points, 10);
  assert.equal(points.highlights_created, 1);
  assert.equal(runtime.queue.size(), 0);
  assert.equal(logs.length >= 1, true);

  archivist.close();
  env.cleanup();
});

test("message updates can promote and later demote a highlight", async () => {
  const env = withArchivistEnvironment();
  const archivist = new ServerArchivist();
  await grantConsent(archivist);
  const runtime = createRuntime({
    archivist,
    logger: { info() {}, warn() {}, error() {} },
  });

  const initialMessage = buildMessage({
    id: "update-message",
    content: "plain update",
    reactions: { cache: createReactionCache(0) },
  });
  const promotedMessage = buildMessage({
    id: "update-message",
    content: "wow updated into a highlight",
    reactions: { cache: createReactionCache(6) },
  });
  const demotedMessage = buildMessage({
    id: "update-message",
    content: "quiet follow-up",
    reactions: { cache: createReactionCache(0) },
  });

  await runtime.processMessage(initialMessage, "messageCreate");
  const promoted = await runtime.processUpdate(initialMessage, promotedMessage);
  const demoted = await runtime.processUpdate(promotedMessage, demotedMessage);

  assert.equal(promoted.becameHighlight, true);
  assert.equal(demoted.lostHighlight, true);
  assert.equal(archivist.getUserPoints(initialMessage.author.id).points, 0);

  archivist.close();
  env.cleanup();
});

test("hydrates partial reactions and removes deleted messages through runtime handlers", async () => {
  const env = withArchivistEnvironment();
  const archivist = new ServerArchivist();
  await grantConsent(archivist);
  const runtime = createRuntime({
    archivist,
    logger: { info() {}, warn() {}, error() {} },
  });
  const message = buildMessage({
    id: "partial-message",
    content: "wow partial flow",
    reactions: { cache: createReactionCache(4) },
  });

  const partialReaction = {
    partial: true,
    message,
    async fetch() {
      return { ...this, partial: false, message };
    },
  };

  await runtime.processReaction(partialReaction, createUser({ id: "user-2" }), "reaction add");
  const removal = await runtime.processDeletion(message, "message deletion");

  assert.equal(removal.removed, true);
  assert.equal(
    archivist
      .db
      .prepare("SELECT * FROM highlights_anonymized WHERE hashed_message_id = ?")
      .all(archivist.hashUserId(message.id)).length,
    0,
  );

  archivist.close();
  env.cleanup();
});

test("sends weekly recaps only once per ISO week when enabled", async () => {
  const env = withArchivistEnvironment();
  const archivist = new ServerArchivist();
  archivist.setWeeklyRecapConfig({
    enabled: true,
    channelId: "weekly-channel",
  });

  const mondayMorning = new Date("2026-03-30T09:30:00");
  assert.equal(archivist.shouldSendWeeklyRecap(mondayMorning), true);

  archivist.markWeeklyRecapSent(mondayMorning);
  assert.equal(archivist.shouldSendWeeklyRecap(mondayMorning), false);

  archivist.close();
  env.cleanup();
});

test("selects the highest-scoring Moment of the Day candidate and avoids reposting it", async () => {
  const env = withArchivistEnvironment();
  const archivist = new ServerArchivist();

  const lowerMoment = buildMessage({
    id: "motd-low",
    content: "wow decent moment",
    reactions: { cache: createReactionCache(3) },
  });
  const higherMoment = buildMessage({
    id: "motd-high",
    content: "wow unforgettable community moment",
    reactions: { cache: createReactionCache(8) },
  });

  await archivist.recordMessage(lowerMoment, { bypassConsent: true });
  await archivist.recordMessage(higherMoment, { bypassConsent: true });

  const firstCandidate = archivist.getMomentOfDayCandidate(new Date("2026-03-31T12:00:00Z"));
  assert.equal(firstCandidate.hashed_message_id, archivist.hashUserId("motd-high"));

  archivist.markMomentOfDaySent(firstCandidate.hashed_message_id, new Date("2026-03-31T12:00:00Z"));

  const secondCandidate = archivist.getMomentOfDayCandidate(new Date("2026-03-31T12:00:00Z"));
  assert.equal(secondCandidate.hashed_message_id, archivist.hashUserId("motd-low"));

  archivist.close();
  env.cleanup();
});

test("sends Moment of the Day only once per UTC day after the configured hour", async () => {
  const env = withArchivistEnvironment();
  const archivist = new ServerArchivist();

  const beforeHour = new Date("2026-03-31T11:00:00Z");
  const afterHour = new Date("2026-03-31T12:05:00Z");

  assert.equal(archivist.shouldSendMomentOfDay(beforeHour), false);
  assert.equal(archivist.shouldSendMomentOfDay(afterHour), true);

  archivist.markMomentOfDaySent("hashed-message", afterHour);
  assert.equal(archivist.shouldSendMomentOfDay(afterHour), false);

  archivist.close();
  env.cleanup();
});

test("registers Discord event handlers on an EventEmitter-compatible client", async () => {
  const env = withArchivistEnvironment();
  const archivist = new ServerArchivist();
  await grantConsent(archivist);
  const client = new EventEmitter();
  const runtime = createRuntime({
    archivist,
    logger: { info() {}, warn() {}, error() {} },
  });

  runtime.registerEventHandlers(client);

  const message = buildMessage({
    id: "emitter-message",
    content: "wow emitter highlight",
    reactions: { cache: createReactionCache(6) },
  });

  client.emit("messageCreate", message);
  await new Promise((resolve) => setImmediate(resolve));

  const points = archivist.getUserPoints(message.author.id);
  assert.equal(points.points, 10);

  archivist.close();
  env.cleanup();
});
