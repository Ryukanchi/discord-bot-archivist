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
const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("example")
    .setDescription("Example command"),

  async execute(interaction) {
    await interaction.reply("Hello!");
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

# 🤖 Discord Bot Archivist

Welcome to the Discord Bot Archivist, a cheery little keeper of highlights that watches your server, celebrates great moments, and keeps the paperwork tidy so you don’t have to. Powered by slash commands, privacy-first data handling, and a hint of sarcasm, it’s ready to archive the best banter your community can throw at it.

## 🚀 Features

- ✅ Automatic highlight detection with NLP sentiment scoring and keyword spice
- 🧠 GDPR-friendly anonymization plus opt-in consent tracking for every user
- 🗂️ Slash command suite for reports, backups, leaderboards, and on-demand analysis
- 🩺 Built-in diagnostics to sanity-check your deployment without leaving Discord
- ♻️ Daily data retention cleanup, configurable via environment variables
- ⚡ Dynamic command loading so new interactions appear without extra wiring

## ⚙️ Setup

```bash
git clone <your-repo-url>
cd discord-bot-archivist
npm install
```

1. Copy `env.example` to `.env`.
2. Fill in these keys (placeholders only, keep secrets secret):
   - `DISCORD_TOKEN` (required)
   - `PRIVACY_SALT` (required, random 32-byte hex recommended)
   - `DATABASE_PATH` (defaults to `./highlights.db`)
   - `DATA_RETENTION_DAYS` (defaults to `30`)
   - `AUTO_DELETE_ENABLED` (defaults to `true`)
   - Optional helpers: `BOT_STATUS`, `BOT_ACTIVITY_NAME`, `BOT_ACTIVITY_TYPE`, `DEV_GUILD_ID`, `SENTIMENT_THRESHOLD`, `REACTION_THRESHOLD`, `REPLY_THRESHOLD`, `MIN_SCORE`, `KEYWORDS`
3. `.env` and `*.db` are already git-ignored, so your secrets stay local by default.

## ▶️ Run

```bash
npm run dev
# or
npm start
```

Expect logs such as:

```
🔄 Initializing Archivist...
✅ Database initialized
🔄 Registering slash commands...
✅ Bot is online! Logged in as YourBot#1234
```

## 🩺 Diagnostics

- Use `/archivist diagnose` (admin-only) for a one-shot health report.
- Results arrive as an ephemeral embed covering:
  - Environment variables (✅/❌ for `DISCORD_TOKEN`, `DATABASE_PATH`, `DATA_RETENTION_DAYS`, `AUTO_DELETE_ENABLED`)
  - Database file accessibility and key table presence (`highlights_anonymized`, `user_points`, `user_privacy`)
  - Discord client readiness and loaded command counts
- Logs show success (`✅ Diagnostics completed`) or failure details if something misbehaves.

## 🧩 Commands

| Command                          | Description                                                                 |
| -------------------------------- | --------------------------------------------------------------------------- |
| `/ping`                          | Latency check with round-trip and websocket timings.                        |
| `/hello`                         | Sends a friendly embed greeting.                                            |
| `/help`                          | Lists all available commands.                                               |
| `/info`                          | Shares bot stats (uptime, memory, versions, guild counts).                  |
| `/random`                        | Generates a random number between 1 and 100.                                |
| `/dice [sides]`                  | Rolls a dice with 2–100 sides.                                              |
| `/weekly`                        | Displays the latest highlight report.                                       |
| `/analyze <message>`             | Scores a message’s highlight potential (consent bypass for manual testing). |
| `/privacy consent value:on\|off` | Opt a user into or out of highlight tracking (ephemeral).                   |
| `/privacy status`                | Shows the caller’s current consent setting (ephemeral).                     |
| `/archivist leaderboard`         | Shows anonymized highlight rankings.                                        |
| `/archivist points [user]`       | Displays highlight stats for a user.                                        |
| `/archivist backup`              | DM’s an anonymized JSON backup to admins.                                   |
| `/archivist clear`               | Wipes highlight data (admin-only).                                          |
| `/archivist diagnose`            | Runs the diagnostics suite (admin-only).                                    |
| `/archivist help`                | Lists all archivist subcommands.                                            |

## 📂 Project Structure

```
discord-bot-archivist/
├── commands/
│   ├── analyze.js
│   ├── archivist.js
│   ├── dice.js
│   ├── hello.js
│   ├── help.js
│   ├── info.js
│   ├── ping.js
│   ├── privacy.js
│   ├── random.js
│   └── weekly.js
├── archivist.js
├── env.example
├── index.js
├── package-lock.json
├── package.json
└── README.md
```

## 🔒 Privacy

- Opt-in consent: users must enable tracking via `/privacy consent value:on` before their messages count.
- Anonymization: author IDs are hashed with `PRIVACY_SALT`, mentions and sensitive patterns morph into neutral placeholders.
- Retention: a daily cleanup job (respecting `DATA_RETENTION_DAYS` and `AUTO_DELETE_ENABLED`) prunes old highlights.
- Control: `/archivist clear` purges all stored data; `/privacy consent value:off` stops and removes a user’s records.

## 🛠️ Development

- `npm run dev` – start the bot in development mode.
- `npm start` – production entrypoint.
- `npx eslint .` – manual linting if you enjoy clean logs.

## 🙋 Contact

Questions, memes, or bug reports? Email **Ryukanchi@gmail.com**.

## 📜 License

This project is released under the **MIT License**. Fork, remix, and archive responsibly.
