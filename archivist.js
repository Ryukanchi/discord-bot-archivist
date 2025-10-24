const natural = require("natural");
const sentiment = require("sentiment");
const Database = require("better-sqlite3");
const crypto = require("crypto");

class ServerArchivist {
  constructor() {
    try {
      console.log("🔄 Initializing database...");
      // Initialize database
      this.db = new Database(process.env.DATABASE_PATH || "./highlights.db");
      this.initDatabase();
      console.log("✅ Database initialized");

      // Initialize privacy system
      this.privacySalt =
        process.env.PRIVACY_SALT || crypto.randomBytes(32).toString("hex");
      console.log("✅ Privacy system initialized");

      console.log("🔄 Initializing NLP tools...");
      // Initialize NLP tools
      this.sentiment = new sentiment();
      this.tokenizer = new natural.WordTokenizer();
      this.stemmer = natural.PorterStemmer;
      console.log("✅ NLP tools initialized");

      // Highlight criteria - load from environment variables
      this.highlightThresholds = {
        sentiment: parseFloat(process.env.SENTIMENT_THRESHOLD) || 0.3,
        reactions: parseInt(process.env.REACTION_THRESHOLD, 10) || 3,
        replies: parseInt(process.env.REPLY_THRESHOLD, 10) || 2,
        keywords: process.env.KEYWORDS
          ? process.env.KEYWORDS.split(",").map((k) => k.trim().toLowerCase())
          : ["lol", "haha", "omg", "wtf", "epic", "amazing", "wow"],
        minScore: parseFloat(process.env.MIN_SCORE) || 0.6,
      };
      console.log("✅ Highlight criteria set");

      const retentionDays = parseInt(process.env.DATA_RETENTION_DAYS, 10);
      this.dataRetentionDays = Number.isNaN(retentionDays)
        ? 30
        : Math.max(retentionDays, 1);
      const autoDeleteFlag = String(process.env.AUTO_DELETE_ENABLED || "true");
      this.autoDeleteEnabled = !["false", "0", "no"].includes(
        autoDeleteFlag.toLowerCase()
      );
      this.cleanupInterval = null;

      if (this.autoDeleteEnabled) {
        this.startDataRetentionJob();
      } else {
        console.log(
          "⚠️  Automatic data cleanup disabled via AUTO_DELETE_ENABLED"
        );
      }
    } catch (error) {
      console.error("❌ Error during Archivist initialization:", error);
      throw error;
    }
  }

  initDatabase() {
    // Gamification Tabelle
    this.db.exec(`
            CREATE TABLE IF NOT EXISTS user_points (
                user_id TEXT PRIMARY KEY,
                points INTEGER DEFAULT 0,
                highlights_created INTEGER DEFAULT 0,
                votes_cast INTEGER DEFAULT 0,
                last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

    // Privacy-Tabellen
    this.db.exec(`
            CREATE TABLE IF NOT EXISTS user_privacy (
                user_id TEXT PRIMARY KEY,
                consent BOOLEAN,
                data_retention_days INTEGER DEFAULT 30,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

    // Anonymisierte Highlights (statt original)
    this.db.exec(`
            CREATE TABLE IF NOT EXISTS highlights_anonymized (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                hashed_author_id TEXT,
                channel_type TEXT,
                anonymized_content TEXT,
                sentiment_score REAL,
                reaction_count INTEGER,
                is_highlight BOOLEAN,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

    // Create indexes for better performance
    this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_highlights_anonymized_created_at 
            ON highlights_anonymized(created_at)
        `);

    this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_highlights_anonymized_is_highlight 
            ON highlights_anonymized(is_highlight)
        `);

    this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_user_points_points 
            ON user_points(points DESC)
        `);
  }

  // Gamification
  addUserPoints(userId, points, options = {}) {
    const { incrementHighlights = false } = options;
    const hashedUserId = this.hashUserId(userId);
    const existing =
      this.db
        .prepare(
          "SELECT points, highlights_created, votes_cast FROM user_points WHERE user_id = ?"
        )
        .get(hashedUserId) || {
        points: 0,
        highlights_created: 0,
        votes_cast: 0,
      };

    const updatedPoints = existing.points + points;
    const updatedHighlights = incrementHighlights
      ? existing.highlights_created + 1
      : existing.highlights_created;

    const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO user_points (user_id, points, highlights_created, votes_cast, last_updated)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        `);
    stmt.run(
      hashedUserId,
      updatedPoints,
      updatedHighlights,
      existing.votes_cast
    );
  }

  getUserPoints(userId) {
    const hashedUserId = this.hashUserId(userId);
    const stmt = this.db.prepare("SELECT * FROM user_points WHERE user_id = ?");
    return (
      stmt.get(hashedUserId) || {
        user_id: hashedUserId,
        points: 0,
        highlights_created: 0,
        votes_cast: 0,
      }
    );
  }

  getLeaderboard(limit = 10) {
    const stmt = this.db.prepare(`
            SELECT * FROM user_points 
            ORDER BY points DESC 
            LIMIT ?
        `);
    return stmt.all(limit);
  }

  // === PRIVACY & DATA PROTECTION METHODS ===

  // Hash user ID for anonymity
  hashUserId(userId) {
    return crypto
      .createHash("sha256")
      .update(userId + this.privacySalt)
      .digest("hex")
      .substring(0, 16);
  }

  // Anonymize messages
  anonymizeContent(content) {
    return content
      .replace(/@\w+/g, "@[USER]") // Anonymize mentions
      .replace(/<@!?\d+>/g, "@[USER]") // Discord Mentions
      .replace(/<#\d+>/g, "#[CHANNEL]") // Channel Mentions
      .replace(/<@&\d+>/g, "@[ROLE]") // Role Mentions
      .replace(/https?:\/\/\S+/g, "[LINK]") // Remove links
      .replace(/\b\d{4}[-/]\d{2}[-/]\d{2}\b/g, "[DATE]") // Dates
      .replace(/\b\d{2}:\d{2}\b/g, "[TIME]") // Times
      .replace(
        /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
        "[EMAIL]"
      ) // Emails
      .substring(0, 200); // Limit length
  }

  // Check user consent
  async checkUserConsent(userId) {
    const stmt = this.db.prepare(
      "SELECT consent FROM user_privacy WHERE user_id = ?"
    );
    const result = stmt.get(this.hashUserId(userId));
    return result ? result.consent : null; // null = not asked
  }

  // Set user consent
  async setUserConsent(userId, consent) {
    const hashedId = this.hashUserId(userId);
    const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO user_privacy (user_id, consent, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
        `);
    stmt.run(hashedId, consent);
  }

  // Delete user data
  async deleteUserData(userId) {
    const hashedId = this.hashUserId(userId);

    // Delete all user data
    this.db
      .prepare("DELETE FROM highlights_anonymized WHERE hashed_author_id = ?")
      .run(hashedId);
    this.db.prepare("DELETE FROM user_points WHERE user_id = ?").run(hashedId);
    this.db.prepare("DELETE FROM user_privacy WHERE user_id = ?").run(hashedId);
  }

  // Automatic data deletion
  startDataRetentionJob() {
    const intervalMs = 24 * 60 * 60 * 1000; // daily
    const runCleanup = () => {
      try {
        this.purgeExpiredHighlights();
        console.log("✅ Data retention cleanup completed");
      } catch (error) {
        console.error("❌ Failed to clean up expired highlights:", error);
      }
    };

    runCleanup();
    this.cleanupInterval = setInterval(runCleanup, intervalMs);
  }

  purgeExpiredHighlights() {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.dataRetentionDays);

    const stmt = this.db.prepare(`
            DELETE FROM highlights_anonymized 
            WHERE created_at < ?
        `);
    stmt.run(cutoff.toISOString());
  }

  // Analyze message and mark as highlight
  async analyzeMessage(message, options = {}) {
    const { bypassConsent = false } = options;
    const content = message.content;
    const author = message.author;
    const channel = message.channel || { type: "unknown" };

    // privacy: strict opt-in
    if (!bypassConsent) {
      const userConsent = await this.checkUserConsent(author.id);
      if (userConsent !== true) {
        return {
          highlightScore: 0,
          isHighlight: false,
          sentimentScore: 0,
          reactionCount: 0,
          keywords: [],
        };
      }
    }

    if (!content) {
      return {
        highlightScore: 0,
        isHighlight: false,
        sentimentScore: 0,
        reactionCount: 0,
        keywords: [],
      };
    }

    // Sentiment-Analyse
    const sentimentResult = this.sentiment.analyze(content);
    const sentimentScore = sentimentResult.score;

    // Keyword-Erkennung
    const keywords = this.detectKeywords(content);

    // Engagement-Metriken
    const reactionCount = message.reactions?.cache?.size || 0;
    const replyCount = 0; // Will be implemented later

    // Highlight-Score berechnen
    const highlightScore = this.calculateHighlightScore({
      sentiment: sentimentScore,
      reactions: reactionCount,
      replies: replyCount,
      keywords: keywords.length,
      contentLength: content.length,
    });

    // Store in anonymized database
    const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO highlights_anonymized 
            (hashed_author_id, channel_type, anonymized_content, sentiment_score, reaction_count, is_highlight)
            VALUES (?, ?, ?, ?, ?, ?)
        `);

    const isHighlight = highlightScore >= this.highlightThresholds.minScore;
    const hashedUserId = this.hashUserId(author.id);
    const anonymizedContent = this.anonymizeContent(content);

    stmt.run(
      hashedUserId,
      channel.type,
      anonymizedContent,
      sentimentScore,
      reactionCount,
      isHighlight ? 1 : 0
    );

    return {
      highlightScore,
      isHighlight,
      sentimentScore,
      reactionCount,
      keywords,
    };
  }

  // Detect keywords in message
  detectKeywords(content) {
    const foundKeywords = [];
    const lowerContent = content.toLowerCase();

    this.highlightThresholds.keywords.forEach((keyword) => {
      if (lowerContent.includes(keyword)) {
        foundKeywords.push(keyword);
      }
    });

    return foundKeywords;
  }

  // Highlight-Score berechnen
  calculateHighlightScore(metrics) {
    let score = 0;

    // Sentiment (0-1)
    const sentimentScore = Math.max(0, metrics.sentiment / 5); // Normalize to 0-1
    score += sentimentScore * 0.3;

    // Reactions (0-1)
    const reactionScore = Math.min(1, metrics.reactions / 10);
    score += reactionScore * 0.3;

    // Keywords (0-1)
    const keywordScore = Math.min(1, metrics.keywords / 3);
    score += keywordScore * 0.2;

    // Content Length (0-1) - nicht zu kurz, nicht zu lang
    const lengthScore = Math.min(
      1,
      Math.max(0, (metrics.contentLength - 10) / 100)
    );
    score += lengthScore * 0.1;

    // Replies (0-1)
    const replyScore = Math.min(1, metrics.replies / 5);
    score += replyScore * 0.1;

    return Math.min(1, score);
  }

  // Generate weekly highlights
  generateWeeklyReport() {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const stmt = this.db.prepare(`
            SELECT * FROM highlights_anonymized 
            WHERE created_at >= ? AND is_highlight = TRUE
            ORDER BY sentiment_score DESC, reaction_count DESC
            LIMIT 10
        `);

    const highlights = stmt.all(weekAgo.toISOString());

    return {
      period: "weekly",
      startDate: weekAgo,
      endDate: new Date(),
      highlights: highlights,
      totalHighlights: highlights.length,
    };
  }

  // Monatliche Highlights generieren
  generateMonthlyReport() {
    const monthAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);

    const stmt = this.db.prepare(`
            SELECT * FROM highlights_anonymized 
            WHERE created_at >= ? AND is_highlight = TRUE
            ORDER BY sentiment_score DESC, reaction_count DESC
            LIMIT 20
        `);

    const highlights = stmt.all(monthAgo.toISOString());

    return {
      period: "monthly",
      startDate: monthAgo,
      endDate: new Date(),
      highlights: highlights,
      totalHighlights: highlights.length,
    };
  }

  // Export als Markdown
  exportToMarkdown(report) {
    let markdown = `# ${
      report.period === "weekly" ? "Weekly" : "Monthly"
    } Highlights\n\n`;
    markdown += `**Period:** ${report.startDate.toLocaleDateString()} - ${report.endDate.toLocaleDateString()}\n`;
    markdown += `**Total Highlights:** ${report.totalHighlights}\n\n`;

    report.highlights.forEach((highlight, index) => {
      markdown += `## Highlight #${index + 1}\n`;
      markdown += `**Channel Type:** ${highlight.channel_type}\n`;
      markdown += `**Sentiment Score:** ${highlight.sentiment_score.toFixed(
        2
      )}\n`;
      markdown += `**Reactions:** ${highlight.reaction_count}\n`;
      markdown += `**Content:** ${highlight.anonymized_content}\n\n`;
    });

    return markdown;
  }

  // Close database
  close() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.db.close();
  }
}

module.exports = ServerArchivist;
