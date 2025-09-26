# 🤖 Server AI-Archivist Discord Bot

A powerful Discord bot with AI-powered highlight detection and automatic server archiving. This bot automatically identifies and archives the best moments from your Discord server using advanced NLP and sentiment analysis.

## 🌟 Features

### 🔍 AI-Powered Highlight Detection
- **Automatic message analysis** using Natural Language Processing
- **Sentiment analysis** to identify positive/engaging content
- **Keyword detection** for viral content (lol, haha, omg, epic, amazing, etc.)
- **Engagement metrics** tracking (reactions, replies)
- **Highlight scoring** (0-100%) for automatic curation

### 📊 Automatic Reporting
- **Weekly highlights** with AI-curated top moments
- **Monthly summaries** of server activity
- **Export functionality** (Markdown, HTML, PDF)
- **Backup system** for data preservation

### 🎮 Gamification
- **User points system** for highlight creators
- **Leaderboards** for top contributors
- **Voting system** for community highlights
- **Achievement tracking** for engagement

### 🔒 Privacy & Data Protection (GDPR Compliant)
- **Opt-in/Opt-out system** for data collection
- **User ID hashing** for anonymity
- **Message anonymization** (mentions, links, emails removed)
- **Automatic data deletion** after 30 days
- **User data control** (view, delete, export)
- **No personal data storage** - only anonymized metrics

### 🧪 Test Mode
- **Single-user testing** for development
- **Scenario simulation** (highlights, normal messages, reactions)
- **Debugging tools** for bot development

## 🚀 Quick Start

### Prerequisites
- **Node.js** (version 16 or higher)
- **Discord account** with server permissions
- **Basic terminal knowledge**

### Step 1: Installation

1. **Clone or download** this repository to your computer
2. **Open terminal** and navigate to the bot folder:
   ```bash
   cd discord-bot
   ```

3. **Install dependencies**:
   ```bash
   npm install
   ```

### Step 2: Discord Bot Setup

1. **Go to Discord Developer Portal**: https://discord.com/developers/applications
2. **Click "New Application"**
3. **Give your bot a name** (e.g., "My Server Archivist")
4. **Click "Create"**

5. **Go to "Bot" section** (left menu)
6. **Click "Add Bot"**
7. **Copy the Bot Token** (keep this secret!)

8. **Go to "OAuth2" → "URL Generator"**
9. **Select "bot" scope**
10. **Select these permissions**:
    - ✅ Send Messages
    - ✅ Read Message History
    - ✅ Use Slash Commands
    - ✅ Read Messages
    - ✅ View Channels

11. **Copy the generated URL** and open it in your browser
12. **Select your Discord server** and click "Authorize"

### Step 3: Bot Configuration

1. **Create a config file**:
   ```bash
   cp config.example.js config.js
   ```

2. **Edit config.js** and add your bot token:
   ```javascript
   module.exports = {
       token: 'YOUR_BOT_TOKEN_HERE',
       prefix: '!',
       status: 'online',
       activity: {
           name: 'with AI',
           type: 'PLAYING'
       }
   };
   ```

### Step 4: Start the Bot

```bash
npm start
```

**Success!** You should see:
```
🤖 Bot is online! Logged in as YourBot#1234
📊 Bot is in 1 servers active
✅ Archivist initialized
✅ All event listeners registered
```

## 📋 Commands

### 🔧 Basic Commands
- **`!ping`** - Tests bot connection
- **`!hello`** - Personal greeting
- **`!help`** - Shows all available commands
- **`!info`** - Shows bot information
- **`!random`** - Generates random number (1-100)
- **`!dice [sides]`** - Rolls dice with specific sides

### 🧪 Test Commands (for single users)
- **`!testmode`** - Activates test mode
- **`!test highlight`** - Simulates a highlight message
- **`!test normal`** - Simulates normal message
- **`!test reactions`** - Simulates many reactions

### 🤖 AI-Archivist Commands
- **`!analyze`** - Analyzes current message with AI
- **`!weekly`** - Shows weekly highlights
- **`!monthly`** - Shows monthly highlights
- **`!export`** - Exports highlights as Markdown

### ⚙️ Advanced Configuration
- **`!archivist setup`** - Interactive setup
- **`!archivist channel #highlights`** - Set highlight channel
- **`!archivist threshold 5`** - Set reaction threshold
- **`!archivist keywords add epic, amazing`** - Add keywords
- **`!archivist sentiment on/off`** - Toggle sentiment analysis
- **`!archivist score min 60`** - Set minimum highlight score
- **`!archivist export pdf`** - Export as PDF
- **`!archivist export html`** - Export as HTML
- **`!archivist backup`** - Create database backup
- **`!archivist clear`** - Clear all highlights (Admin only)

### 🎮 Gamification
- **`!archivist gamemode on/off`** - Toggle voting system
- **`!archivist leaderboard`** - Show top contributors
- **`!archivist points @user`** - Show user points

### 🔒 Privacy & Data Protection
- **`!privacy opt-in`** - Enable data collection (GDPR compliant)
- **`!privacy opt-out`** - Disable data collection and delete your data
- **`!privacy status`** - Check your privacy settings
- **`!privacy delete-my-data`** - Delete all your stored data
- **`!privacy help`** - Show privacy information and controls

## 🔧 Configuration

### Highlight Detection Settings
The bot automatically detects highlights based on:
- **Sentiment score** (positive content)
- **Reaction count** (engagement)
- **Keyword presence** (viral indicators)
- **Message length** (not too short/long)
- **Reply count** (discussion engagement)

### Customizable Keywords
Default keywords: `lol`, `haha`, `omg`, `wtf`, `epic`, `amazing`, `wow`

Add more with: `!archivist keywords add your, keywords, here`

### Threshold Settings
- **Reaction threshold**: Minimum reactions for highlight (default: 3)
- **Sentiment threshold**: Minimum sentiment score (default: 0.3)
- **Score threshold**: Minimum highlight score percentage (default: 60%)

## 📁 File Structure

```
discord-bot/
├── index.js              # Main bot file
├── archivist.js          # AI-Archivist system
├── config.js            # Bot configuration
├── config.example.js     # Configuration template
├── package.json          # Dependencies
├── highlights.db         # SQLite database (auto-created)
├── bot.log              # Bot logs
└── README.md            # This file
```

## 🗄️ Database Schema

### Highlights Table
- **message_id**: Discord message ID
- **channel_id**: Discord channel ID
- **author_id**: Message author ID
- **content**: Message content
- **timestamp**: Message timestamp
- **sentiment_score**: AI sentiment analysis score
- **reaction_count**: Number of reactions
- **reply_count**: Number of replies
- **is_highlight**: Boolean highlight status

### User Points Table
- **user_id**: Discord user ID
- **points**: Total points earned
- **highlights_created**: Number of highlights created
- **votes_cast**: Number of votes cast

## 🚀 Advanced Usage

### Running in Background
```bash
# Start bot in background
nohup npm start > bot.log 2>&1 &

# Check if running
ps aux | grep "node index.js"

# Stop bot
pkill -f "node index.js"
```

### Logs and Debugging
```bash
# View bot logs
tail -f bot.log

# Check for errors
grep "ERROR" bot.log
```

### Database Management
```bash
# Backup database
cp highlights.db highlights_backup.db

# View database
sqlite3 highlights.db
.tables
SELECT * FROM highlights LIMIT 10;
```

## 🔒 Security & Privacy

### Security Notes
- **Never share your bot token** publicly
- **Use environment variables** for production
- **Regular backups** of your database
- **Monitor bot permissions** in Discord

### Privacy & GDPR Compliance
- **✅ User consent required** - Users must opt-in to data collection
- **✅ Data anonymization** - User IDs are hashed, messages are anonymized
- **✅ Automatic deletion** - Data is automatically deleted after 30 days
- **✅ User control** - Users can view, delete, or export their data anytime
- **✅ No personal data** - Only anonymized metrics and sentiment scores are stored
- **✅ Transparent processing** - Users know exactly what data is collected
- **✅ Right to be forgotten** - Users can delete all their data instantly

### What Data is Stored
- **Anonymized message content** (mentions, links, emails removed)
- **Sentiment analysis scores** (anonymous metrics)
- **Reaction counts** (engagement metrics)
- **Hashed user identifiers** (not personally identifiable)
- **Channel types** (text, voice, etc. - not specific channel IDs)

### What Data is NOT Stored
- ❌ **Discord user IDs** (only hashed versions)
- ❌ **Personal information** (names, emails, phone numbers)
- ❌ **Private messages** (only public server messages)
- ❌ **Voice data** (only text messages)
- ❌ **Location data** (no geolocation tracking)

## 🛠️ Troubleshooting

### Bot Won't Start
1. **Check Node.js version**: `node --version` (should be 16+)
2. **Check dependencies**: `npm install`
3. **Check token**: Verify bot token in config.js
4. **Check permissions**: Bot needs proper Discord permissions

### Bot Not Responding
1. **Check if online**: Look for green dot in Discord
2. **Check logs**: `cat bot.log`
3. **Restart bot**: `pkill -f "node index.js" && npm start`

### Database Issues
1. **Check file permissions**: `ls -la highlights.db`
2. **Recreate database**: Delete `highlights.db` and restart
3. **Check disk space**: `df -h`

## 📈 Performance Tips

- **Monitor memory usage** for large servers
- **Regular database cleanup** for old highlights
- **Optimize keyword lists** for better performance
- **Use background processing** for heavy operations

## 🤝 Contributing

1. **Fork the repository**
2. **Create feature branch**: `git checkout -b feature-name`
3. **Make changes** and test thoroughly
4. **Submit pull request** with description

## 📄 License

MIT License - feel free to use and modify!

## 🆘 Support

- **Check logs** first: `cat bot.log`
- **Verify configuration** in config.js
- **Test with single user** using test mode
- **Check Discord permissions** and bot status

### 📧 Contact & Feedback

For suggestions, bug reports, or questions, please contact:
**Email:** [Ryukanchi@gmail.com](mailto:Ryukanchi@gmail.com)

We appreciate your feedback and contributions to improve this Discord bot!

## 🎉 Success!

Your Server AI-Archivist is now running! The bot will automatically:
- ✅ **Analyze messages** for highlights
- ✅ **Archive top moments** in database
- ✅ **Generate reports** weekly/monthly
- ✅ **Track user engagement** and points
- ✅ **Export highlights** for sharing
- ✅ **Respect user privacy** with GDPR compliance
- ✅ **Anonymize all data** for user protection

**Enjoy your AI-powered Discord server archiving!** 🤖✨

## 🔒 Privacy First

This bot is designed with privacy and data protection in mind:
- **GDPR compliant** - Full user control over data
- **Privacy by design** - Only necessary data is collected
- **Transparent processing** - Users know exactly what happens to their data
- **Automatic cleanup** - Data is automatically deleted after 30 days
- **User empowerment** - Users can opt-out or delete their data anytime

**Your privacy matters!** 🛡️