# 🤖 Discord Bot Archivist - Modernized

A Discord bot that automatically detects and archives highlights in server messages. **Fully modernized with Slash Commands and improved privacy compliance.**

## ✨ New Features (Modernization 2024)

- **🎯 Slash Commands**: All commands have been converted to modern Discord Slash Commands
- **🔒 Enhanced Privacy**: GDPR-compliant anonymized data storage
- **⚡ Performance Optimization**: Database indexes for better performance
- **🛠️ Modern Architecture**: Clean code structure with dynamic command loading
- **📁 Centralized Configuration**: All settings via `.env` file

## 🚀 Installation

### 1. Clone Repository
```bash
git clone <repository-url>
cd discord-bot-archivist-main
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Copy `env.example` to `.env` and fill in the values:

```bash
cp env.example .env
```

**Important Configuration:**
```env
# Discord Bot Token (required)
DISCORD_TOKEN=your_bot_token_here

# Privacy Salt (required - generate a random 32-byte hex string)
PRIVACY_SALT=your_random_32_byte_hex_string_here

# Bot Configuration
BOT_ACTIVITY_NAME=Highlight Watch
BOT_ACTIVITY_TYPE=PLAYING

# Highlight Detection
SENTIMENT_THRESHOLD=0.3
REACTION_THRESHOLD=3
MIN_SCORE=0.6
KEYWORDS=lol,haha,omg,wtf,epic,amazing,wow,xd,lmao,rofl,pog,based,cringe,sus
```

### 4. Start Bot
```bash
npm start
```

## 🎮 Available Slash Commands

### Basic Commands
- `/ping` - Tests bot connection and shows latency
- `/hello` - Greets the user
- `/help` - Shows all available commands
- `/info` - Shows bot information and statistics
- `/random` - Generates a random number (1-100)
- `/dice [sides]` - Rolls dice with a specific number of sides

### Highlight Tools
- `/analyze <message>` - Analyze a message for highlight potential
- `/weekly` - Show the weekly highlights report
- `/privacy consent value:on|off` - Opt in or out of highlight tracking
- `/privacy status` - Display your current privacy status

### Archivist Commands
- `/archivist leaderboard` - Show the highlight leaderboard
- `/archivist points [user]` - Show user highlight points
- `/archivist backup` - Create a backup of highlights
- `/archivist clear` - Delete all highlights (admins only)
- `/archivist help` - List archivist subcommands

## 🔒 Privacy & Compliance

### GDPR-Compliant Features
- **Anonymized Data Storage**: User IDs are hashed
- **Opt-in/Opt-out System**: Users can consent/withdraw at any time
- **Automatic Deletion**: Data is automatically deleted after 30 days
- **Data Minimization**: Only anonymized content is stored
- **Transparency**: Users can view and delete their data at any time

### What is stored?
- ✅ Anonymized message content
- ✅ Sentiment scores
- ✅ Reaction count
- ❌ **NO** user IDs or personal data
- ❌ **NO** channel IDs or server IDs

## 🏗️ Architecture

### Project Structure
```
discord-bot-archivist-main/
├── commands/           # Slash Command definitions
│   ├── ping.js
│   ├── hello.js
│   ├── help.js
│   ├── info.js
│   ├── random.js
│   ├── dice.js
│   ├── analyze.js
│   ├── weekly.js
│   ├── privacy.js
│   └── archivist.js
├── index.js            # Main bot file
├── archivist.js        # Archivist core logic
├── package.json        # Dependencies
├── env.example         # Configuration template
└── README.md          # This file
```

### Database Schema
- `highlights_anonymized` - Anonymized highlights
- `user_points` - Gamification points
- `user_privacy` - Privacy settings
- **Indexes** for optimal performance

## ⚙️ Configuration

### Environment Variables
All configuration is done via the `.env` file:

```env
# Discord
DISCORD_TOKEN=your_bot_token_here
PRIVACY_SALT=your_random_32_byte_hex_string_here

# Bot Behavior
BOT_ACTIVITY_NAME=Highlight Watch
BOT_ACTIVITY_TYPE=PLAYING

# Highlight Detection
SENTIMENT_THRESHOLD=0.3
REACTION_THRESHOLD=3
REPLY_THRESHOLD=2
MIN_SCORE=0.6
KEYWORDS=lol,haha,omg,wtf,epic,amazing,wow

# Privacy
DATA_RETENTION_DAYS=30
AUTO_DELETE_ENABLED=true
```

## 🚀 Deployment

### Local Development
```bash
npm start
```

### Production Deployment
1. Create a `.env` file with your production values
2. Ensure all dependencies are installed
3. Start the bot with `npm start`

### Docker (Optional)
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
CMD ["npm", "start"]
```

## 🛠️ Development

### Adding New Commands
1. Create a new file in `commands/`
2. Implement `data` (SlashCommandBuilder) and `execute` (function)
3. The bot automatically loads commands on startup

### Example Command
```javascript
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('example')
        .setDescription('Example command'),
    
    async execute(interaction) {
        await interaction.reply('Hello!');
    },
};
```

## 📊 Performance Optimizations

- **Database Indexes** for fast queries
- **Asynchronous File Operations** for better performance
- **Dynamic Command Loading** for modular architecture
- **Memory Management** with automatic cleanup

## 🔧 Troubleshooting

### Common Issues

**Bot won't start:**
- Check the `DISCORD_TOKEN` in the `.env` file
- Ensure all dependencies are installed

**Slash Commands don't appear:**
- Wait up to 1 hour for global command registration
- Check bot permissions

**Database errors:**
- Check the `DATABASE_PATH` in the `.env` file
- Ensure the bot has write permissions

## 📝 Changelog

### Version 2.0.0 (Modernization 2024)
- ✅ Migration to Slash Commands
- ✅ Enhanced privacy compliance
- ✅ Performance optimizations
- ✅ Modern code architecture
- ✅ Centralized configuration

### Version 1.0.0 (Original)
- Basic highlight detection
- Prefix commands
- Basic privacy

## 📄 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Create a pull request

## 📞 Support

For suggestions, bug reports, or questions, you can create an issue in the repository or contact me via email: Ryukanchi@gmail.com
- Create an issue in the repository
- Check the troubleshooting section
- Consult the Discord.js documentation

---

**🎉 Enjoy your modernized Discord Bot Archivist!**
