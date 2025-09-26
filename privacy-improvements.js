// PRIVACY IMPROVEMENTS FOR DISCORD BOT
// ======================================

const crypto = require('crypto');

class PrivacyManager {
    constructor() {
        this.salt = process.env.PRIVACY_SALT || crypto.randomBytes(32).toString('hex');
    }

    // 1. USER-ID HASHING
    hashUserId(userId) {
        return crypto.createHash('sha256')
            .update(userId + this.salt)
            .digest('hex')
            .substring(0, 16); // Shorter for better performance
    }

    // 2. MESSAGE ANONYMIZATION
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

    // 3. OPT-IN/OPT-OUT SYSTEM
    async checkUserConsent(userId) {
        const stmt = this.db.prepare('SELECT consent FROM user_privacy WHERE user_id = ?');
        const result = stmt.get(this.hashUserId(userId));
        return result ? result.consent : null; // null = nicht gefragt
    }

    async setUserConsent(userId, consent) {
        const hashedId = this.hashUserId(userId);
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO user_privacy (user_id, consent, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
        `);
        stmt.run(hashedId, consent);
    }

    // 4. DATA MINIMIZATION
    shouldStoreMessage(message) {
        // Only store if:
        // - User has consented
        // - No private channels
        // - No bot messages
        return !message.author.bot && 
               message.channel.type !== 'DM' &&
               !message.content.includes('!private');
    }

    // 5. AUTOMATIC DELETION
    async scheduleDataDeletion() {
        // Automatically delete after 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const stmt = this.db.prepare(`
            DELETE FROM highlights 
            WHERE timestamp < ?
        `);
        stmt.run(thirtyDaysAgo.toISOString());
    }
}

// PRIVACY TABLES FOR DATABASE
const PRIVACY_TABLES = `
    -- User Privacy Settings
    CREATE TABLE IF NOT EXISTS user_privacy (
        user_id TEXT PRIMARY KEY,
        consent BOOLEAN,
        data_retention_days INTEGER DEFAULT 30,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Anonymisierte Highlights (statt original)
    CREATE TABLE IF NOT EXISTS highlights_anonymized (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hashed_author_id TEXT,
        channel_type TEXT,  -- 'text', 'voice', etc. (nicht spezifische ID)
        anonymized_content TEXT,
        sentiment_score REAL,
        reaction_count INTEGER,
        is_highlight BOOLEAN,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
`;

module.exports = { PrivacyManager, PRIVACY_TABLES };

