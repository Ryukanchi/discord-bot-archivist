const natural = require('natural');
const sentiment = require('sentiment');
const Database = require('better-sqlite3');
const fs = require('fs');
const crypto = require('crypto');

class ServerArchivist {
    constructor() {
        try {
            console.log('🔄 Initializing database...');
            // Initialize database
            this.db = new Database('./highlights.db');
            this.initDatabase();
            console.log('✅ Database initialized');
            
            // Initialize privacy system
            this.privacySalt = process.env.PRIVACY_SALT || crypto.randomBytes(32).toString('hex');
            console.log('✅ Privacy system initialized');
            
            console.log('🔄 Initializing NLP tools...');
            // Initialize NLP tools
            this.sentiment = new sentiment();
            this.tokenizer = new natural.WordTokenizer();
            this.stemmer = natural.PorterStemmer;
            console.log('✅ NLP tools initialized');
            
            console.log('🔄 Loading configuration...');
            // Load configuration
            this.config = this.loadConfig();
            console.log('✅ Configuration loaded');
            
            // Highlight criteria
            this.highlightThresholds = {
                sentiment: this.config.sentimentThreshold || 0.3,
                reactions: this.config.reactionThreshold || 3,
                replies: this.config.replyThreshold || 2,
                keywords: this.config.keywords || ['lol', 'haha', 'omg', 'wtf', 'epic', 'amazing', 'wow'],
                minScore: this.config.minScore || 0.6
            };
            console.log('✅ Highlight criteria set');
        } catch (error) {
            console.error('❌ Error during Archivist initialization:', error);
            throw error;
        }
    }

    initDatabase() {
        // Create highlights table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS highlights (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                message_id TEXT UNIQUE,
                channel_id TEXT,
                author_id TEXT,
                content TEXT,
                timestamp DATETIME,
                sentiment_score REAL,
                reaction_count INTEGER,
                reply_count INTEGER,
                is_highlight BOOLEAN DEFAULT FALSE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Reactions Tabelle
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS reactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                message_id TEXT,
                emoji TEXT,
                user_id TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Weekly/Monthly Reports
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT, -- 'weekly' or 'monthly'
                period_start DATE,
                period_end DATE,
                highlights_count INTEGER,
                top_highlights TEXT, -- JSON
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Konfiguration Tabelle
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS config (
                key TEXT PRIMARY KEY,
                value TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

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
    }

    // Load configuration
    loadConfig() {
        const stmt = this.db.prepare('SELECT key, value FROM config');
        const rows = stmt.all();
        
        const config = {};
        rows.forEach(row => {
            try {
                config[row.key] = JSON.parse(row.value);
            } catch {
                config[row.key] = row.value;
            }
        });
        
        return config;
    }

    // Konfiguration speichern
    saveConfig(key, value) {
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO config (key, value, updated_at) 
            VALUES (?, ?, CURRENT_TIMESTAMP)
        `);
        stmt.run(key, JSON.stringify(value));
        this.config[key] = value;
    }

    // Setup method
    setup(guildId, channelId, options = {}) {
        this.saveConfig('guildId', guildId);
        this.saveConfig('highlightChannel', channelId);
        this.saveConfig('language', options.language || 'en');
        this.saveConfig('timezone', options.timezone || 'Europe/Berlin');
        this.saveConfig('sentimentEnabled', options.sentiment !== false);
        this.saveConfig('gamemode', options.gamemode || false);
        
        return {
            guildId,
            channelId,
            language: options.language || 'en',
            timezone: options.timezone || 'Europe/Berlin',
            sentimentEnabled: options.sentiment !== false,
            gamemode: options.gamemode || false
        };
    }

    // Schwellenwerte setzen
    setThreshold(type, value) {
        switch(type) {
            case 'reactions':
                this.saveConfig('reactionThreshold', parseInt(value));
                this.highlightThresholds.reactions = parseInt(value);
                break;
            case 'sentiment':
                this.saveConfig('sentimentThreshold', parseFloat(value));
                this.highlightThresholds.sentiment = parseFloat(value);
                break;
            case 'score':
                this.saveConfig('minScore', parseFloat(value) / 100);
                this.highlightThresholds.minScore = parseFloat(value) / 100;
                break;
        }
    }

    // Keywords verwalten
    addKeywords(keywords) {
        const newKeywords = keywords.split(',').map(k => k.trim().toLowerCase());
        const currentKeywords = this.highlightThresholds.keywords;
        const updatedKeywords = [...new Set([...currentKeywords, ...newKeywords])];
        
        this.saveConfig('keywords', updatedKeywords);
        this.highlightThresholds.keywords = updatedKeywords;
        
        return updatedKeywords;
    }

    getKeywords() {
        return this.highlightThresholds.keywords;
    }

    // Gamification
    addUserPoints(userId, points) {
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO user_points (user_id, points, last_updated)
            VALUES (?, COALESCE((SELECT points FROM user_points WHERE user_id = ?), 0) + ?, CURRENT_TIMESTAMP)
        `);
        stmt.run(userId, userId, points);
    }

    getUserPoints(userId) {
        const stmt = this.db.prepare('SELECT * FROM user_points WHERE user_id = ?');
        return stmt.get(userId) || { user_id: userId, points: 0, highlights_created: 0, votes_cast: 0 };
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
        return crypto.createHash('sha256')
            .update(userId + this.privacySalt)
            .digest('hex')
            .substring(0, 16);
    }

    // Anonymize messages
    anonymizeContent(content) {
        return content
            .replace(/@\w+/g, '@[USER]')           // Anonymize mentions
            .replace(/<@!?\d+>/g, '@[USER]')        // Discord Mentions
            .replace(/<#\d+>/g, '#[CHANNEL]')       // Channel Mentions
            .replace(/<@&\d+>/g, '@[ROLE]')         // Role Mentions
            .replace(/https?:\/\/\S+/g, '[LINK]')   // Remove links
            .replace(/\b\d{4}[-/]\d{2}[-/]\d{2}\b/g, '[DATE]')  // Dates
            .replace(/\b\d{2}:\d{2}\b/g, '[TIME]')  // Times
            .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]')  // Emails
            .substring(0, 200); // Limit length
    }

    // Check user consent
    async checkUserConsent(userId) {
        const stmt = this.db.prepare('SELECT consent FROM user_privacy WHERE user_id = ?');
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
        this.db.prepare('DELETE FROM highlights WHERE author_id = ?').run(userId);
        this.db.prepare('DELETE FROM highlights_anonymized WHERE hashed_author_id = ?').run(hashedId);
        this.db.prepare('DELETE FROM user_points WHERE user_id = ?').run(hashedId);
        this.db.prepare('DELETE FROM user_privacy WHERE user_id = ?').run(hashedId);
    }

    // Automatic data deletion
    async scheduleDataDeletion() {
        // Automatically delete after 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const stmt = this.db.prepare(`
            DELETE FROM highlights 
            WHERE timestamp < ?
        `);
        stmt.run(thirtyDaysAgo.toISOString());
        
        const stmt2 = this.db.prepare(`
            DELETE FROM highlights_anonymized 
            WHERE created_at < ?
        `);
        stmt2.run(thirtyDaysAgo.toISOString());
    }

    // Analyze message and mark as highlight
    async analyzeMessage(message) {
        const content = message.content;
        const author = message.author;
        const channel = message.channel;
        
        // Privacy-Check: Nur analysieren wenn User zugestimmt hat
        const userConsent = await this.checkUserConsent(author.id);
        if (userConsent === false) {
            return { highlightScore: 0, isHighlight: false, sentimentScore: 0, reactionCount: 0, keywords: [] };
        }
        
        // Sentiment-Analyse
        const sentimentResult = this.sentiment.analyze(content);
        const sentimentScore = sentimentResult.score;
        
        // Keyword-Erkennung
        const keywords = this.detectKeywords(content);
        
        // Engagement-Metriken
        const reactionCount = message.reactions.cache.size;
        const replyCount = 0; // Will be implemented later
        
        // Highlight-Score berechnen
        const highlightScore = this.calculateHighlightScore({
            sentiment: sentimentScore,
            reactions: reactionCount,
            replies: replyCount,
            keywords: keywords.length,
            contentLength: content.length
        });

        // Store in anonymized database
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO highlights_anonymized 
            (hashed_author_id, channel_type, anonymized_content, sentiment_score, reaction_count, is_highlight)
            VALUES (?, ?, ?, ?, ?, ?)
        `);

        const isHighlight = highlightScore >= 0.7;
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
            keywords
        };
    }

    // Detect keywords in message
    detectKeywords(content) {
        const foundKeywords = [];
        const lowerContent = content.toLowerCase();
        
        this.highlightThresholds.keywords.forEach(keyword => {
            if (lowerContent.includes(keyword)) {
                foundKeywords.push(keyword);
            }
        });

        // Additional meme keywords
        const memeKeywords = ['xd', 'lmao', 'rofl', 'pog', 'based', 'cringe', 'sus'];
        memeKeywords.forEach(keyword => {
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
        const lengthScore = Math.min(1, Math.max(0, (metrics.contentLength - 10) / 100));
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
            SELECT * FROM highlights 
            WHERE timestamp >= ? AND is_highlight = TRUE
            ORDER BY sentiment_score DESC, reaction_count DESC
            LIMIT 10
        `);
        
        const highlights = stmt.all(weekAgo.toISOString());
        
        return {
            period: 'weekly',
            startDate: weekAgo,
            endDate: new Date(),
            highlights: highlights,
            totalHighlights: highlights.length
        };
    }

    // Monatliche Highlights generieren
    generateMonthlyReport() {
        const monthAgo = new Date();
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        
        const stmt = this.db.prepare(`
            SELECT * FROM highlights 
            WHERE timestamp >= ? AND is_highlight = TRUE
            ORDER BY sentiment_score DESC, reaction_count DESC
            LIMIT 20
        `);
        
        const highlights = stmt.all(monthAgo.toISOString());
        
        return {
            period: 'monthly',
            startDate: monthAgo,
            endDate: new Date(),
            highlights: highlights,
            totalHighlights: highlights.length
        };
    }

    // Export als Markdown
    exportToMarkdown(report) {
        let markdown = `# ${report.period === 'weekly' ? 'Weekly' : 'Monthly'} Highlights\n\n`;
        markdown += `**Period:** ${report.startDate.toLocaleDateString()} - ${report.endDate.toLocaleDateString()}\n`;
        markdown += `**Anzahl Highlights:** ${report.totalHighlights}\n\n`;
        
        report.highlights.forEach((highlight, index) => {
            markdown += `## Highlight #${index + 1}\n`;
            markdown += `**Autor:** <@${highlight.author_id}>\n`;
            markdown += `**Channel:** <#${highlight.channel_id}>\n`;
            markdown += `**Sentiment Score:** ${highlight.sentiment_score.toFixed(2)}\n`;
            markdown += `**Reactions:** ${highlight.reaction_count}\n`;
            markdown += `**Inhalt:** ${highlight.content}\n\n`;
        });
        
        return markdown;
    }

    // Close database
    close() {
        this.db.close();
    }
}

module.exports = ServerArchivist;
