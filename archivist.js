const sentiment = require("sentiment");
const Database = require("better-sqlite3");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const DEFAULT_THRESHOLDS = Object.freeze({
  sentiment: 0.3,
  reactions: 3,
  replies: 2,
  minScore: 0.6,
  keywords: ["lol", "haha", "omg", "wtf", "epic", "amazing", "wow"],
});

const DEFAULT_RETENTION_DAYS = 30;
const DEFAULT_WEEKLY_LIMIT = 5;
const HIGHLIGHT_POINT_VALUE = 10;
const DEFAULT_MOTD_POST_HOUR = 12;

class ServerArchivist {
  constructor() {
    this.databasePath = process.env.DATABASE_PATH || "./highlights.db";
    this.highlightThresholds = this.loadHighlightThresholds();
    this.dataRetentionDays = this.loadRetentionDays();
    this.autoDeleteEnabled = this.loadAutoDeleteFlag();
    this.cleanupInterval = null;

    try {
      this.db = new Database(this.databasePath);
      this.configureDatabase();
      this.initDatabase();
      this.runMigrations();
      this.prepareStatements();
      this.privacySalt = this.loadPrivacySalt();
      this.sentiment = new sentiment();

      if (this.autoDeleteEnabled) {
        this.startDataRetentionJob();
      }
    } catch (error) {
      throw new Error(
        `Failed to initialize the archivist service: ${error.message}`,
        { cause: error },
      );
    }
  }

  configureDatabase() {
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("synchronous = NORMAL");
    this.db.pragma("busy_timeout = 5000");
  }

  loadHighlightThresholds() {
    return {
      sentiment:
        Number.parseFloat(process.env.SENTIMENT_THRESHOLD) ||
        DEFAULT_THRESHOLDS.sentiment,
      reactions:
        Number.parseInt(process.env.REACTION_THRESHOLD, 10) ||
        DEFAULT_THRESHOLDS.reactions,
      replies:
        Number.parseInt(process.env.REPLY_THRESHOLD, 10) ||
        DEFAULT_THRESHOLDS.replies,
      minScore:
        Number.parseFloat(process.env.MIN_SCORE) || DEFAULT_THRESHOLDS.minScore,
      keywords: process.env.KEYWORDS
        ? Array.from(
            new Set(
              process.env.KEYWORDS.split(",")
                .map((keyword) => keyword.trim().toLowerCase())
                .filter(Boolean),
            ),
          )
        : DEFAULT_THRESHOLDS.keywords,
    };
  }

  loadRetentionDays() {
    const retentionDays = Number.parseInt(process.env.DATA_RETENTION_DAYS, 10);
    return Number.isNaN(retentionDays)
      ? DEFAULT_RETENTION_DAYS
      : Math.max(retentionDays, 1);
  }

  loadAutoDeleteFlag() {
    const autoDeleteFlag = String(process.env.AUTO_DELETE_ENABLED || "true");
    return !["false", "0", "no"].includes(autoDeleteFlag.toLowerCase());
  }

  initDatabase() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_points (
        user_id TEXT PRIMARY KEY,
        points INTEGER DEFAULT 0,
        highlights_created INTEGER DEFAULT 0,
        votes_cast INTEGER DEFAULT 0,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_privacy (
        user_id TEXT PRIMARY KEY,
        consent BOOLEAN,
        data_retention_days INTEGER DEFAULT 30,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS highlights_anonymized (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hashed_author_id TEXT NOT NULL,
        hashed_message_id TEXT,
        channel_type TEXT NOT NULL,
        anonymized_content TEXT NOT NULL,
        sentiment_score REAL NOT NULL,
        reaction_count INTEGER NOT NULL,
        is_highlight BOOLEAN NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS channel_settings (
        channel_id TEXT PRIMARY KEY,
        mode TEXT NOT NULL CHECK(mode IN ('include', 'exclude')),
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_highlights_anonymized_created_at
      ON highlights_anonymized(created_at)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_highlights_anonymized_is_highlight
      ON highlights_anonymized(is_highlight)
    `);
    this.db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_highlights_anonymized_hashed_message_id
      ON highlights_anonymized(hashed_message_id)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_user_points_points
      ON user_points(points DESC)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_channel_settings_mode
      ON channel_settings(mode)
    `);
  }

  runMigrations() {
    const columns = this.db.prepare("PRAGMA table_info(highlights_anonymized)").all();
    const hasHashedMessageId = columns.some(
      (column) => column.name === "hashed_message_id",
    );

    if (!hasHashedMessageId) {
      this.db.exec(`
        ALTER TABLE highlights_anonymized
        ADD COLUMN hashed_message_id TEXT
      `);
    }

    this.db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_highlights_anonymized_hashed_message_id
      ON highlights_anonymized(hashed_message_id)
    `);
  }

  prepareStatements() {
    this.statements = {
      healthCheck: this.db.prepare("SELECT 1 AS ok"),
      getUserPoints: this.db.prepare(
        "SELECT * FROM user_points WHERE user_id = ?",
      ),
      getLeaderboard: this.db.prepare(`
        SELECT * FROM user_points
        ORDER BY points DESC
        LIMIT ?
      `),
      getUserConsent: this.db.prepare(
        "SELECT consent FROM user_privacy WHERE user_id = ?",
      ),
      upsertUserConsent: this.db.prepare(`
        INSERT INTO user_privacy (user_id, consent, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id) DO UPDATE SET
          consent = excluded.consent,
          updated_at = CURRENT_TIMESTAMP
      `),
      getStoredHighlight: this.db.prepare(`
        SELECT hashed_author_id, hashed_message_id, sentiment_score, reaction_count, is_highlight, created_at
        FROM highlights_anonymized
        WHERE hashed_message_id = ?
      `),
      upsertHighlight: this.db.prepare(`
        INSERT INTO highlights_anonymized (
          hashed_author_id,
          hashed_message_id,
          channel_type,
          anonymized_content,
          sentiment_score,
          reaction_count,
          is_highlight
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(hashed_message_id) DO UPDATE SET
          hashed_author_id = excluded.hashed_author_id,
          channel_type = excluded.channel_type,
          anonymized_content = excluded.anonymized_content,
          sentiment_score = excluded.sentiment_score,
          reaction_count = excluded.reaction_count,
          is_highlight = excluded.is_highlight
      `),
      deleteHighlightByMessageId: this.db.prepare(`
        DELETE FROM highlights_anonymized
        WHERE hashed_message_id = ?
      `),
      deleteHighlightsByAuthorId: this.db.prepare(`
        DELETE FROM highlights_anonymized
        WHERE hashed_author_id = ?
      `),
      deleteUserPoints: this.db.prepare("DELETE FROM user_points WHERE user_id = ?"),
      deleteUserPrivacy: this.db.prepare("DELETE FROM user_privacy WHERE user_id = ?"),
      mutateUserPoints: this.db.prepare(`
        INSERT INTO user_points (user_id, points, highlights_created, votes_cast, last_updated)
        VALUES (?, ?, ?, 0, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id) DO UPDATE SET
          points = MAX(0, user_points.points + excluded.points),
          highlights_created = MAX(0, user_points.highlights_created + excluded.highlights_created),
          last_updated = CURRENT_TIMESTAMP
      `),
      fetchHighlightsSince: this.db.prepare(`
        SELECT *
        FROM highlights_anonymized
        WHERE created_at >= ? AND is_highlight = TRUE
        ORDER BY reaction_count DESC, sentiment_score DESC, created_at DESC
        LIMIT ?
      `),
      fetchDailyMomentCandidates: this.db.prepare(`
        SELECT *
        FROM highlights_anonymized
        WHERE created_at >= ? AND is_highlight = TRUE
        ORDER BY created_at DESC
        LIMIT ?
      `),
      countHighlights: this.db.prepare(`
        SELECT COUNT(*) AS count
        FROM highlights_anonymized
        WHERE is_highlight = TRUE
      `),
      deleteExpiredHighlights: this.db.prepare(`
        DELETE FROM highlights_anonymized
        WHERE created_at < ?
      `),
      getSetting: this.db.prepare(`
        SELECT value
        FROM app_settings
        WHERE key = ?
      `),
      setSetting: this.db.prepare(`
        INSERT INTO app_settings (key, value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = CURRENT_TIMESTAMP
      `),
      listChannelRules: this.db.prepare(`
        SELECT channel_id, mode
        FROM channel_settings
        ORDER BY mode ASC, channel_id ASC
      `),
      setChannelRule: this.db.prepare(`
        INSERT INTO channel_settings (channel_id, mode, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(channel_id) DO UPDATE SET
          mode = excluded.mode,
          updated_at = CURRENT_TIMESTAMP
      `),
      removeChannelRule: this.db.prepare(`
        DELETE FROM channel_settings
        WHERE channel_id = ?
      `),
      countChannelRulesByMode: this.db.prepare(`
        SELECT COUNT(*) AS count
        FROM channel_settings
        WHERE mode = ?
      `),
      getChannelRule: this.db.prepare(`
        SELECT mode
        FROM channel_settings
        WHERE channel_id = ?
      `),
    };

    this.persistAnalysisTransaction = this.db.transaction((analysis) => {
      const existingRecord = this.statements.getStoredHighlight.get(
        analysis.hashedMessageId,
      );
      const wasHighlight = Boolean(existingRecord?.is_highlight);

      this.statements.upsertHighlight.run(
        analysis.hashedAuthorId,
        analysis.hashedMessageId,
        analysis.channelType,
        analysis.anonymizedContent,
        analysis.sentimentScore,
        analysis.reactionCount,
        analysis.isHighlight ? 1 : 0,
      );

      if (!wasHighlight && analysis.isHighlight) {
        this.applyPointMutation(analysis.hashedAuthorId, HIGHLIGHT_POINT_VALUE, 1);
      }

      if (wasHighlight && !analysis.isHighlight) {
        this.applyPointMutation(analysis.hashedAuthorId, -HIGHLIGHT_POINT_VALUE, -1);
      }

      return {
        ...analysis,
        wasHighlight,
        becameHighlight: analysis.isHighlight && !wasHighlight,
        lostHighlight: wasHighlight && !analysis.isHighlight,
      };
    });

    this.removeStoredMessageTransaction = this.db.transaction((hashedMessageId) => {
      const existingRecord = this.statements.getStoredHighlight.get(hashedMessageId);
      if (!existingRecord) {
        return { removed: false, removedHighlight: false };
      }

      this.statements.deleteHighlightByMessageId.run(hashedMessageId);

      if (existingRecord.is_highlight) {
        this.applyPointMutation(
          existingRecord.hashed_author_id,
          -HIGHLIGHT_POINT_VALUE,
          -1,
        );
      }

      return {
        removed: true,
        removedHighlight: Boolean(existingRecord.is_highlight),
      };
    });

    this.deleteUserDataTransaction = this.db.transaction((hashedUserId) => {
      this.statements.deleteHighlightsByAuthorId.run(hashedUserId);
      this.statements.deleteUserPoints.run(hashedUserId);
      this.statements.deleteUserPrivacy.run(hashedUserId);
    });
  }

  getPrivacySaltFilePath() {
    const absoluteDatabasePath = path.resolve(process.cwd(), this.databasePath);
    return path.join(path.dirname(absoluteDatabasePath), ".privacy_salt");
  }

  loadPrivacySalt() {
    if (process.env.PRIVACY_SALT) {
      return process.env.PRIVACY_SALT;
    }

    const saltFilePath = this.getPrivacySaltFilePath();
    if (fs.existsSync(saltFilePath)) {
      const fileSalt = fs.readFileSync(saltFilePath, "utf8").trim();
      try {
        fs.chmodSync(saltFilePath, 0o600);
      } catch {
        // Best-effort hardening only.
      }
      return fileSalt;
    }

    const generatedSalt = crypto.randomBytes(32).toString("hex");
    fs.writeFileSync(saltFilePath, generatedSalt, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    return generatedSalt;
  }

  hashUserId(value) {
    return crypto
      .createHash("sha256")
      .update(`${value}${this.privacySalt}`)
      .digest("hex")
      .substring(0, 16);
  }

  anonymizeContent(content) {
    return String(content)
      .replace(/<@!?\d+>/g, "@[USER]")
      .replace(/<#\d+>/g, "#[CHANNEL]")
      .replace(/<@&\d+>/g, "@[ROLE]")
      .replace(/https?:\/\/\S+/g, "[LINK]")
      .replace(
        /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
        "[EMAIL]",
      )
      .replace(/\b\d{4}[-/]\d{2}[-/]\d{2}\b/g, "[DATE]")
      .replace(/\b\d{2}:\d{2}\b/g, "[TIME]")
      .replace(/(^|\s)@\w+/g, "$1@[USER]")
      .substring(0, 200);
  }

  async checkUserConsent(userId) {
    const result = this.statements.getUserConsent.get(this.hashUserId(userId));
    return result ? result.consent : null;
  }

  async setUserConsent(userId, consent) {
    this.statements.upsertUserConsent.run(this.hashUserId(userId), consent ? 1 : 0);
  }

  async deleteUserData(userId) {
    this.deleteUserDataTransaction(this.hashUserId(userId));
  }

  isConsentGranted(value) {
    return value === true || value === 1;
  }

  createEmptyAnalysis(overrides = {}) {
    return {
      highlightScore: 0,
      isHighlight: false,
      wasHighlight: false,
      becameHighlight: false,
      lostHighlight: false,
      sentimentScore: 0,
      reactionCount: 0,
      keywords: [],
      channelType: "unknown",
      channelId: null,
      contentLength: 0,
      reason: "ignored",
      monitored: true,
      reactionThreshold: this.getReactionThreshold(),
      minScore: this.highlightThresholds.minScore,
      contributions: {
        sentiment: 0,
        reactions: 0,
        keywords: 0,
        contentLength: 0,
        replies: 0,
      },
      ...overrides,
    };
  }

  getReactionCount(message) {
    const reactionCache = message?.reactions?.cache;
    if (!reactionCache) {
      return 0;
    }

    if (typeof reactionCache.values === "function") {
      return Array.from(reactionCache.values()).reduce(
        (total, reaction) => total + (reaction?.count || 0),
        0,
      );
    }

    if (typeof reactionCache.reduce === "function") {
      return reactionCache.reduce(
        (total, reaction) => total + (reaction?.count || 0),
        0,
      );
    }

    return Number.isInteger(reactionCache.size) ? reactionCache.size : 0;
  }

  detectKeywords(content) {
    const normalizedContent = String(content).toLowerCase();
    return this.highlightThresholds.keywords.filter((keyword) =>
      normalizedContent.includes(keyword),
    );
  }

  calculateHighlightComponents(metrics) {
    const reactionThreshold = Math.max(1, this.getReactionThreshold());
    const sentimentComponent = Math.max(0, metrics.sentiment / 5) * 0.3;
    const reactionComponent = Math.min(1, metrics.reactions / reactionThreshold) * 0.3;
    const keywordComponent = Math.min(1, metrics.keywords / 3) * 0.2;
    const lengthComponent =
      Math.min(1, Math.max(0, (metrics.contentLength - 10) / 100)) * 0.1;
    const replyComponent = Math.min(1, metrics.replies / 5) * 0.1;

    return {
      sentiment: sentimentComponent,
      reactions: reactionComponent,
      keywords: keywordComponent,
      contentLength: lengthComponent,
      replies: replyComponent,
    };
  }

  calculateHighlightScore(metrics) {
    const contributions = this.calculateHighlightComponents(metrics);
    return {
      score: Math.min(
        1,
        contributions.sentiment +
          contributions.reactions +
          contributions.keywords +
          contributions.contentLength +
          contributions.replies,
      ),
      contributions,
    };
  }

  createMessageContext(message) {
    if (!message?.id || !message?.author?.id || message.author.bot) {
      return null;
    }

    const content = String(message.content || "").trim();
    if (!content) {
      return null;
    }

    return {
      messageId: message.id,
      authorId: message.author.id,
      content,
      channelId: message.channel?.id || null,
      channelType: String(message.channel?.type || "unknown"),
      reactionCount: this.getReactionCount(message),
      replyCount: Number(message.thread?.messageCount || 0),
    };
  }

  getSetting(key, fallback = null) {
    const row = this.statements.getSetting.get(key);
    return row ? row.value : fallback;
  }

  setSetting(key, value) {
    this.statements.setSetting.run(key, value == null ? null : String(value));
  }

  getBooleanSetting(key, fallback = false) {
    const rawValue = this.getSetting(key);
    if (rawValue == null) {
      return fallback;
    }
    return ["true", "1", "yes", "on"].includes(String(rawValue).toLowerCase());
  }

  getNumberSetting(key, fallback) {
    const rawValue = this.getSetting(key);
    if (rawValue == null) {
      return fallback;
    }
    const parsed = Number(rawValue);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  getStringSetting(key, fallback = null) {
    const value = this.getSetting(key);
    return value == null || value === "" ? fallback : value;
  }

  getReactionThreshold() {
    return Math.max(
      1,
      Math.round(
        this.getNumberSetting(
          "reaction_threshold",
          this.highlightThresholds.reactions,
        ),
      ),
    );
  }

  setReactionThreshold(value) {
    this.setSetting("reaction_threshold", Math.max(1, Math.round(value)));
  }

  getAutoHighlightPostingConfig() {
    return {
      enabled: this.getBooleanSetting("auto_highlight_posting_enabled", false),
      channelId: this.getStringSetting("auto_highlight_posting_channel_id"),
    };
  }

  setAutoHighlightPosting({ enabled, channelId }) {
    this.setSetting("auto_highlight_posting_enabled", enabled ? "true" : "false");
    if (channelId) {
      this.setSetting("auto_highlight_posting_channel_id", channelId);
    }
  }

  getWeeklyRecapConfig() {
    return {
      enabled: this.getBooleanSetting("weekly_recap_enabled", false),
      channelId: this.getStringSetting("weekly_recap_channel_id"),
      lastSentWeekKey: this.getStringSetting("weekly_recap_last_sent_week"),
    };
  }

  setWeeklyRecapConfig({ enabled, channelId }) {
    this.setSetting("weekly_recap_enabled", enabled ? "true" : "false");
    if (channelId) {
      this.setSetting("weekly_recap_channel_id", channelId);
    }
  }

  getMomentOfDayConfig() {
    return {
      enabled: this.getBooleanSetting(
        "motd_enabled",
        ["true", "1", "yes", "on"].includes(
          String(process.env.MOTD_ENABLED || "false").toLowerCase(),
        ),
      ),
      channelId: this.getStringSetting(
        "motd_channel_id",
        process.env.MOTD_CHANNEL_ID || null,
      ),
      postHourUtc: Math.max(
        0,
        Math.min(
          23,
          Math.round(
            this.getNumberSetting(
              "motd_post_hour",
              Number.parseInt(process.env.MOTD_POST_HOUR, 10) ||
                DEFAULT_MOTD_POST_HOUR,
            ),
          ),
        ),
      ),
      lastSentDateKey: this.getStringSetting("motd_last_sent_date"),
      lastSentMessageId: this.getStringSetting("motd_last_sent_message_id"),
    };
  }

  setMomentOfDayConfig({ enabled, channelId, postHourUtc }) {
    if (typeof enabled === "boolean") {
      this.setSetting("motd_enabled", enabled ? "true" : "false");
    }

    if (channelId) {
      this.setSetting("motd_channel_id", channelId);
    }

    if (typeof postHourUtc === "number" && Number.isFinite(postHourUtc)) {
      const normalizedHour = Math.max(0, Math.min(23, Math.round(postHourUtc)));
      this.setSetting("motd_post_hour", String(normalizedHour));
    }
  }

  markMomentOfDaySent(hashedMessageId, date = new Date()) {
    this.setSetting("motd_last_sent_date", this.getUtcDateKey(date));
    this.setSetting("motd_last_sent_message_id", hashedMessageId);
  }

  getUtcDateKey(date = new Date()) {
    return date.toISOString().slice(0, 10);
  }

  shouldSendMomentOfDay(now = new Date()) {
    const config = this.getMomentOfDayConfig();
    if (!config.enabled || !config.channelId) {
      return false;
    }

    if (now.getUTCHours() < config.postHourUtc) {
      return false;
    }

    return config.lastSentDateKey !== this.getUtcDateKey(now);
  }

  getNextMomentOfDayRun(now = new Date()) {
    const config = this.getMomentOfDayConfig();
    if (!config.enabled || !config.channelId) {
      return null;
    }

    const nextRun = new Date(now);
    nextRun.setUTCMinutes(0, 0, 0);
    nextRun.setUTCHours(config.postHourUtc);

    if (now >= nextRun || config.lastSentDateKey === this.getUtcDateKey(now)) {
      nextRun.setUTCDate(nextRun.getUTCDate() + 1);
    }

    return nextRun;
  }

  createStoredHighlightSummary(highlight) {
    const { score } = this.calculateHighlightScore({
      sentiment: highlight.sentiment_score,
      reactions: highlight.reaction_count,
      replies: 0,
      keywords: 0,
      contentLength: String(highlight.anonymized_content || "").length,
    });

    return {
      ...highlight,
      highlightScore: score,
    };
  }

  getMomentOfDayCandidate(now = new Date()) {
    const startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const config = this.getMomentOfDayConfig();
    const candidates = this.statements.fetchDailyMomentCandidates
      .all(startDate.toISOString(), 50)
      .map((highlight) => this.createStoredHighlightSummary(highlight))
      .filter(
        (highlight) =>
          highlight.highlightScore >= this.highlightThresholds.minScore &&
          highlight.hashed_message_id !== config.lastSentMessageId,
      )
      .sort((left, right) => {
        if (right.highlightScore !== left.highlightScore) {
          return right.highlightScore - left.highlightScore;
        }
        if (right.reaction_count !== left.reaction_count) {
          return right.reaction_count - left.reaction_count;
        }
        return String(right.created_at).localeCompare(String(left.created_at));
      });

    return candidates[0] || null;
  }

  getIsoWeekKey(date = new Date()) {
    const value = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = value.getUTCDay() || 7;
    value.setUTCDate(value.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(value.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((value - yearStart) / 86400000 + 1) / 7);
    return `${value.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
  }

  shouldSendWeeklyRecap(now = new Date()) {
    const config = this.getWeeklyRecapConfig();
    if (!config.enabled || !config.channelId) {
      return false;
    }

    const localDay = now.getDay();
    const localHour = now.getHours();
    if (localDay !== 1 || localHour < 9) {
      return false;
    }

    return config.lastSentWeekKey !== this.getIsoWeekKey(now);
  }

  markWeeklyRecapSent(date = new Date()) {
    this.setSetting("weekly_recap_last_sent_week", this.getIsoWeekKey(date));
  }

  listChannelRules() {
    return this.statements.listChannelRules.all();
  }

  getMonitoringSummary() {
    const rules = this.listChannelRules();
    return {
      includes: rules.filter((rule) => rule.mode === "include"),
      excludes: rules.filter((rule) => rule.mode === "exclude"),
    };
  }

  setChannelRule(channelId, mode) {
    if (!["include", "exclude"].includes(mode)) {
      throw new Error("Channel mode must be include or exclude.");
    }
    this.statements.setChannelRule.run(channelId, mode);
  }

  removeChannelRule(channelId) {
    this.statements.removeChannelRule.run(channelId);
  }

  shouldMonitorChannel(channelId) {
    if (!channelId) {
      return true;
    }

    const rule = this.statements.getChannelRule.get(channelId);
    if (rule?.mode === "exclude") {
      return false;
    }

    const includeCount = this.statements.countChannelRulesByMode.get("include").count;
    if (includeCount === 0) {
      return true;
    }

    return rule?.mode === "include";
  }

  async evaluateMessage(message, options = {}) {
    const { bypassConsent = false } = options;
    const context = this.createMessageContext(message);

    if (!context) {
      return this.createEmptyAnalysis({ reason: "message-not-processable" });
    }

    if (!this.shouldMonitorChannel(context.channelId)) {
      return this.createEmptyAnalysis({
        reason: "channel-not-monitored",
        monitored: false,
        channelType: context.channelType,
        channelId: context.channelId,
        contentLength: context.content.length,
      });
    }

    if (!bypassConsent) {
      const userConsent = await this.checkUserConsent(context.authorId);
      if (!this.isConsentGranted(userConsent)) {
        return this.createEmptyAnalysis({
          reason: "consent-not-granted",
          channelType: context.channelType,
          channelId: context.channelId,
          contentLength: context.content.length,
        });
      }
    }

    const sentimentScore = this.sentiment.analyze(context.content).score;
    const keywords = this.detectKeywords(context.content);
    const { score, contributions } = this.calculateHighlightScore({
      sentiment: sentimentScore,
      reactions: context.reactionCount,
      replies: context.replyCount,
      keywords: keywords.length,
      contentLength: context.content.length,
    });

    return {
      highlightScore: score,
      isHighlight: score >= this.highlightThresholds.minScore,
      wasHighlight: false,
      becameHighlight: false,
      lostHighlight: false,
      sentimentScore,
      reactionCount: context.reactionCount,
      keywords,
      channelType: context.channelType,
      channelId: context.channelId,
      contentLength: context.content.length,
      reason: "processed",
      monitored: true,
      reactionThreshold: this.getReactionThreshold(),
      minScore: this.highlightThresholds.minScore,
      contributions,
      hashedAuthorId: this.hashUserId(context.authorId),
      hashedMessageId: this.hashUserId(context.messageId),
      anonymizedContent: this.anonymizeContent(context.content),
    };
  }

  async analyzeMessage(message, options = {}) {
    return this.evaluateMessage(message, options);
  }

  async inspectMessage(message, options = {}) {
    const analysis = await this.evaluateMessage(message, options);
    const stored = message?.id
      ? this.statements.getStoredHighlight.get(this.hashUserId(message.id))
      : null;

    return {
      ...analysis,
      storedHighlight: stored
        ? {
            isHighlight: Boolean(stored.is_highlight),
            sentimentScore: stored.sentiment_score,
            reactionCount: stored.reaction_count,
            createdAt: stored.created_at,
          }
        : null,
    };
  }

  async recordMessage(message, options = {}) {
    const analysis = await this.evaluateMessage(message, options);
    if (analysis.reason !== "processed") {
      return analysis;
    }

    return this.persistAnalysisTransaction(analysis);
  }

  removeStoredMessage(messageId) {
    if (!messageId) {
      return { removed: false, removedHighlight: false };
    }

    return this.removeStoredMessageTransaction(this.hashUserId(messageId));
  }

  applyPointMutation(hashedUserId, pointDelta, highlightDelta) {
    this.statements.mutateUserPoints.run(hashedUserId, pointDelta, highlightDelta);
  }

  addUserPoints(userId, points, options = {}) {
    const highlightDelta = options.incrementHighlights ? 1 : 0;
    this.applyPointMutation(this.hashUserId(userId), points, highlightDelta);
  }

  getUserPoints(userId) {
    return (
      this.statements.getUserPoints.get(this.hashUserId(userId)) || {
        user_id: this.hashUserId(userId),
        points: 0,
        highlights_created: 0,
        votes_cast: 0,
      }
    );
  }

  getLeaderboard(limit = 10) {
    return this.statements.getLeaderboard.all(limit);
  }

  getHighlightCount() {
    return this.statements.countHighlights.get().count;
  }

  getHealthSnapshot(runtimeHealth = null) {
    let databaseReachable = false;
    try {
      databaseReachable = this.statements.healthCheck.get().ok === 1;
    } catch {
      databaseReachable = false;
    }

    return {
      databaseReachable,
      highlightCount: this.getHighlightCount(),
      reactionThreshold: this.getReactionThreshold(),
      minScore: this.highlightThresholds.minScore,
      monitoring: this.getMonitoringSummary(),
      weeklyRecap: this.getWeeklyRecapConfig(),
      momentOfDay: this.getMomentOfDayConfig(),
      autoHighlightPosting: this.getAutoHighlightPostingConfig(),
      runtime: runtimeHealth,
    };
  }

  getPrivacySummary() {
    return {
      stored: [
        "Hashed author identifiers",
        "Hashed message identifiers",
        "Anonymized content excerpts",
        "Sentiment score and reaction count",
        "Highlight state and creation timestamp",
      ],
      anonymized: [
        "User mentions are replaced with placeholders",
        "Channel mentions are replaced with placeholders",
        "Role mentions are replaced with placeholders",
        "Links, emails, dates, and times are redacted",
        "Raw Discord user IDs and server IDs are not stored in highlight rows",
      ],
    };
  }

  startDataRetentionJob() {
    const intervalMs = 24 * 60 * 60 * 1000;
    const runCleanup = () => {
      this.purgeExpiredHighlights();
    };

    runCleanup();
    this.cleanupInterval = setInterval(runCleanup, intervalMs);
    this.cleanupInterval.unref?.();
  }

  purgeExpiredHighlights() {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.dataRetentionDays);
    this.statements.deleteExpiredHighlights.run(cutoff.toISOString());
  }

  buildReport({ period, days, limit }) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const highlights = this.statements.fetchHighlightsSince.all(
      startDate.toISOString(),
      limit,
    );

    return {
      period,
      startDate,
      endDate: new Date(),
      highlights,
      totalHighlights: highlights.length,
    };
  }

  generateWeeklyReport(limit = DEFAULT_WEEKLY_LIMIT) {
    return this.buildReport({ period: "weekly", days: 7, limit });
  }

  generateMonthlyReport() {
    return this.buildReport({ period: "monthly", days: 30, limit: 20 });
  }

  exportToMarkdown(report) {
    let markdown = `# ${report.period === "weekly" ? "Weekly" : "Monthly"} Highlights\n\n`;
    markdown += `**Period:** ${report.startDate.toLocaleDateString()} - ${report.endDate.toLocaleDateString()}\n`;
    markdown += `**Total highlights:** ${report.totalHighlights}\n\n`;

    report.highlights.forEach((highlight, index) => {
      markdown += `## Highlight ${index + 1}\n`;
      markdown += `**Channel type:** ${highlight.channel_type}\n`;
      markdown += `**Sentiment score:** ${highlight.sentiment_score.toFixed(2)}\n`;
      markdown += `**Reactions:** ${highlight.reaction_count}\n`;
      markdown += `**Content:** ${highlight.anonymized_content}\n\n`;
    });

    return markdown;
  }

  close() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.db.close();
  }
}

module.exports = ServerArchivist;
