const { Client, GatewayIntentBits, Events, EmbedBuilder } = require('discord.js');
const config = require('./config.js');
const ServerArchivist = require('./archivist.js');

// Create Bot Client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Initialize Archivist
console.log('🔄 Initializing Archivist...');
const archivist = new ServerArchivist();
console.log('✅ Archivist successfully initialized');

// Bot is ready
client.once(Events.ClientReady, readyClient => {
    console.log(`🤖 Bot is online! Logged in as ${readyClient.user.tag}`);
    console.log(`📊 Bot is active in ${client.guilds.cache.size} servers`);
    console.log(`✅ Archivist initialized`);
    console.log(`✅ All event listeners registered`);
});

// Process messages
client.on(Events.MessageCreate, async message => {
    // Ignore bot messages
    if (message.author.bot) return;

    // Ping-Pong command
    if (message.content === '!ping') {
        message.reply('🏓 Pong!');
    }

    // Hello command
    if (message.content === '!hello') {
        message.reply(`Hello ${message.author.username}! 👋`);
    }

    // Help command
    if (message.content === '!help') {
        const embed = new EmbedBuilder()
            .setTitle('🤖 Bot Commands')
            .setDescription('Here are all available commands:')
            .addFields(
                { name: '!ping', value: 'Tests bot connection', inline: true },
                { name: '!hello', value: 'Says hello back', inline: true },
                { name: '!help', value: 'Shows this help', inline: true },
                { name: '!info', value: 'Shows bot information', inline: true },
                { name: '!random', value: 'Generates a random number', inline: true },
                { name: '!dice [sides]', value: 'Rolls dice with specific sides', inline: true },
                { name: '!archivist', value: 'Shows all archivist commands', inline: true }
            )
            .setColor(0x00ff00)
            .setTimestamp();
        
        message.reply({ embeds: [embed] });
    }

    // Info command
    if (message.content === '!info') {
        const embed = new EmbedBuilder()
            .setTitle('🤖 Bot Information')
            .addFields(
                { name: 'Bot Name', value: client.user.username, inline: true },
                { name: 'Server', value: message.guild.name, inline: true },
                { name: 'User', value: message.author.username, inline: true },
                { name: 'Ping', value: `${client.ws.ping}ms`, inline: true },
                { name: 'Uptime', value: `${Math.floor(client.uptime / 1000)}s`, inline: true }
            )
            .setColor(0x0099ff)
            .setTimestamp();
        
        message.reply({ embeds: [embed] });
    }

    // Random number command
    if (message.content === '!random') {
        const randomNumber = Math.floor(Math.random() * 100) + 1;
        message.reply(`🎲 Your random number is: **${randomNumber}**`);
    }

    // Dice command
    if (message.content.startsWith('!dice')) {
        const args = message.content.split(' ');
        const sides = args[1] ? parseInt(args[1]) : 6;
        
        if (isNaN(sides) || sides < 2 || sides > 100) {
            message.reply('❌ Please provide a valid number between 2 and 100!');
            return;
        }
        
        const result = Math.floor(Math.random() * sides) + 1;
        message.reply(`🎲 Dice (${sides} sides): **${result}**`);
    }


    // === ARCHIVIST COMMANDS ===
    
    // Analyze message
    if (message.content.startsWith('!analyze')) {
        try {
            const analysis = await archivist.analyzeMessage(message);
            
            const embed = new EmbedBuilder()
                .setTitle('🔍 Message Analysis')
                .addFields(
                    { name: 'Highlight Score', value: `${(analysis.highlightScore * 100).toFixed(1)}%`, inline: true },
                    { name: 'Sentiment', value: `${analysis.sentimentScore.toFixed(2)}`, inline: true },
                    { name: 'Reactions', value: `${analysis.reactionCount}`, inline: true },
                    { name: 'Keywords', value: analysis.keywords.join(', ') || 'None', inline: false },
                    { name: 'Status', value: analysis.isHighlight ? '✅ Highlight!' : '❌ No Highlight', inline: true }
                )
                .setColor(analysis.isHighlight ? 0x00ff00 : 0xff0000)
                .setTimestamp();
            
            message.reply({ embeds: [embed] });
        } catch (error) {
            message.reply('❌ Error during analysis!');
        }
    }

    // Test mode for single users
    if (message.content === '!testmode') {
        const embed = new EmbedBuilder()
            .setTitle('🧪 Test Mode Activated')
            .setDescription('The bot now simulates various scenarios for you!')
            .addFields(
                { name: 'Test Commands', value: '`!test highlight` - Simulates a highlight\n`!test normal` - Simulates normal message\n`!test reactions` - Simulates many reactions', inline: false }
            )
            .setColor(0x9932cc)
            .setTimestamp();
        
        message.reply({ embeds: [embed] });
    }

    // Test-Szenarien
    if (message.content.startsWith('!test')) {
        const testType = message.content.split(' ')[1];
        
        if (testType === 'highlight') {
            // Simulate a highlight
            const testMessage = {
                content: 'This is an epic moment! lol haha omg this is so amazing!',
                author: message.author,
                channel: message.channel,
                id: 'test_' + Date.now(),
                createdAt: new Date(),
                reactions: { cache: { size: 5 } }
            };
            
            const analysis = await archivist.analyzeMessage(testMessage);
            
            const embed = new EmbedBuilder()
                .setTitle('🧪 Test: Highlight Simulation')
                .setDescription('**Simulated Message:** "This is an epic moment! lol haha omg this is so amazing!"')
                .addFields(
                    { name: 'Highlight Score', value: `${(analysis.highlightScore * 100).toFixed(1)}%`, inline: true },
                    { name: 'Sentiment', value: `${analysis.sentimentScore.toFixed(2)}`, inline: true },
                    { name: 'Keywords', value: analysis.keywords.join(', '), inline: false },
                    { name: 'Status', value: analysis.isHighlight ? '✅ Highlight!' : '❌ No Highlight', inline: true }
                )
                .setColor(0x00ff00)
                .setTimestamp();
            
            message.reply({ embeds: [embed] });
            
        } else if (testType === 'normal') {
            // Simulate normal message
            const testMessage = {
                content: 'Hello, how are you?',
                author: message.author,
                channel: message.channel,
                id: 'test_' + Date.now(),
                createdAt: new Date(),
                reactions: { cache: { size: 0 } }
            };
            
            const analysis = await archivist.analyzeMessage(testMessage);
            
            const embed = new EmbedBuilder()
                .setTitle('🧪 Test: Normal Message')
                .setDescription('**Simulated Message:** "Hello, how are you?"')
                .addFields(
                    { name: 'Highlight Score', value: `${(analysis.highlightScore * 100).toFixed(1)}%`, inline: true },
                    { name: 'Sentiment', value: `${analysis.sentimentScore.toFixed(2)}`, inline: true },
                    { name: 'Keywords', value: analysis.keywords.join(', ') || 'None', inline: false },
                    { name: 'Status', value: analysis.isHighlight ? '✅ Highlight!' : '❌ No Highlight', inline: true }
                )
                .setColor(0xff0000)
                .setTimestamp();
            
            message.reply({ embeds: [embed] });
            
        } else if (testType === 'reactions') {
            // Simulate many reactions
            const testMessage = {
                content: 'This is a viral-worthy post!',
                author: message.author,
                channel: message.channel,
                id: 'test_' + Date.now(),
                createdAt: new Date(),
                reactions: { cache: { size: 10 } }
            };
            
            const analysis = await archivist.analyzeMessage(testMessage);
            
            const embed = new EmbedBuilder()
                .setTitle('🧪 Test: Many Reactions')
                .setDescription('**Simulated Message:** "This is a viral-worthy post!" (10 Reactions)')
                .addFields(
                    { name: 'Highlight Score', value: `${(analysis.highlightScore * 100).toFixed(1)}%`, inline: true },
                    { name: 'Sentiment', value: `${analysis.sentimentScore.toFixed(2)}`, inline: true },
                    { name: 'Reactions', value: '10', inline: true },
                    { name: 'Status', value: analysis.isHighlight ? '✅ Highlight!' : '❌ No Highlight', inline: true }
                )
                .setColor(0x0099ff)
                .setTimestamp();
            
            message.reply({ embeds: [embed] });
        }
    }

    // Weekly highlights
    if (message.content === '!weekly') {
        try {
            const report = archivist.generateWeeklyReport();
            
            const embed = new EmbedBuilder()
                .setTitle('📅 Weekly Highlights')
                .setDescription(`**Period:** ${report.startDate.toLocaleDateString()} - ${report.endDate.toLocaleDateString()}`)
                .addFields(
                    { name: 'Number of Highlights', value: `${report.totalHighlights}`, inline: true },
                    { name: 'Top Highlight', value: report.highlights[0]?.content || 'No highlights', inline: false }
                )
                .setColor(0x0099ff)
                .setTimestamp();
            
            message.reply({ embeds: [embed] });
        } catch (error) {
            message.reply('❌ Error generating report!');
        }
    }

    // Monthly highlights
    if (message.content === '!monthly') {
        try {
            const report = archivist.generateMonthlyReport();
            
            const embed = new EmbedBuilder()
                .setTitle('📅 Monthly Highlights')
                .setDescription(`**Period:** ${report.startDate.toLocaleDateString()} - ${report.endDate.toLocaleDateString()}`)
                .addFields(
                    { name: 'Number of Highlights', value: `${report.totalHighlights}`, inline: true },
                    { name: 'Top Highlights', value: report.highlights.slice(0, 3).map(h => h.content).join('\n') || 'No highlights', inline: false }
                )
                .setColor(0x0099ff)
                .setTimestamp();
            
            message.reply({ embeds: [embed] });
        } catch (error) {
            message.reply('❌ Error generating report!');
        }
    }

    // Export als Markdown
    if (message.content === '!export') {
        try {
            const report = archivist.generateWeeklyReport();
            const markdown = archivist.exportToMarkdown(report);
            
            // Create markdown file
            const filename = `highlights_${Date.now()}.md`;
            require('fs').writeFileSync(filename, markdown);
            
            message.reply(`📄 Export created: \`${filename}\``);
        } catch (error) {
            message.reply('❌ Error during export!');
        }
    }

    // Archivist help
    if (message.content === '!archivist') {
        const embed = new EmbedBuilder()
            .setTitle('🤖 Server AI-Archivist')
            .setDescription('Automatic highlight detection and archiving')
            .addFields(
                { name: '📊 Analysis', value: '`!analyze` - Analyzes the current message', inline: true },
                { name: '📅 Reports', value: '`!weekly` / `!monthly` - Shows highlights', inline: true },
                { name: '📄 Export', value: '`!export` - Exports as Markdown', inline: true },
                { name: '⚙️ Setup', value: '`!archivist setup` - Interactive setup', inline: true },
                { name: '🎮 Gamification', value: '`!archivist gamemode on/off`', inline: true },
                { name: '🏆 Leaderboard', value: '`!archivist leaderboard`', inline: true }
            )
            .setColor(0x9932cc)
            .setTimestamp();
        
        message.reply({ embeds: [embed] });
    }

    // === ADVANCED ARCHIVIST COMMANDS ===
    
    // Setup
    if (message.content.startsWith('!archivist setup')) {
        try {
            const setup = archivist.setup(
                message.guild.id,
                message.channel.id,
                { language: 'en', timezone: 'Europe/Berlin', gamemode: true }
            );
            
            const embed = new EmbedBuilder()
                .setTitle('⚙️ Archivist Setup')
                .setDescription('Server AI-Archivist has been successfully set up!')
                .addFields(
                    { name: 'Server', value: message.guild.name, inline: true },
                    { name: 'Channel', value: `<#${message.channel.id}>`, inline: true },
                    { name: 'Language', value: setup.language, inline: true },
                    { name: 'Timezone', value: setup.timezone, inline: true },
                    { name: 'Gamemode', value: setup.gamemode ? '✅ Active' : '❌ Inactive', inline: true }
                )
                .setColor(0x00ff00)
                .setTimestamp();
            
            message.reply({ embeds: [embed] });
        } catch (error) {
            message.reply('❌ Error during setup!');
        }
    }

    // Set channel
    if (message.content.startsWith('!archivist channel')) {
        const channelMatch = message.content.match(/<#(\d+)>/);
        if (channelMatch) {
            const channelId = channelMatch[1];
            archivist.saveConfig('highlightChannel', channelId);
            message.reply(`✅ Highlight channel set: <#${channelId}>`);
        } else {
            message.reply('❌ Please provide a valid channel! Example: `!archivist channel #highlights`');
        }
    }

    // Set thresholds
    if (message.content.startsWith('!archivist threshold')) {
        const value = parseInt(message.content.split(' ')[2]);
        if (isNaN(value)) {
            message.reply('❌ Please provide a valid number! Example: `!archivist threshold 5`');
            return;
        }
        
        archivist.setThreshold('reactions', value);
        message.reply(`✅ Reaction threshold set: ${value}`);
    }

    // Add keywords
    if (message.content.startsWith('!archivist keywords add')) {
        const keywords = message.content.replace('!archivist keywords add ', '');
        const updatedKeywords = archivist.addKeywords(keywords);
        
        const embed = new EmbedBuilder()
            .setTitle('🔑 Keywords updated')
            .setDescription(`New keywords added: ${keywords}`)
            .addFields(
                { name: 'All Keywords', value: updatedKeywords.join(', '), inline: false }
            )
            .setColor(0x0099ff)
            .setTimestamp();
        
        message.reply({ embeds: [embed] });
    }

    // Show keywords
    if (message.content === '!archivist keywords list') {
        const keywords = archivist.getKeywords();
        
        const embed = new EmbedBuilder()
            .setTitle('🔑 Current Keywords')
            .setDescription(keywords.join(', '))
            .setColor(0x0099ff)
            .setTimestamp();
        
        message.reply({ embeds: [embed] });
    }

    // Sentiment ein/aus
    if (message.content.startsWith('!archivist sentiment')) {
        const action = message.content.split(' ')[2];
        const enabled = action === 'on';
        
        archivist.saveConfig('sentimentEnabled', enabled);
        message.reply(`✅ Sentiment analysis ${enabled ? 'enabled' : 'disabled'}`);
    }

    // Score threshold
    if (message.content.startsWith('!archivist score min')) {
        const value = parseInt(message.content.split(' ')[3]);
        if (isNaN(value) || value < 0 || value > 100) {
            message.reply('❌ Please provide a number between 0 and 100!');
            return;
        }
        
        archivist.setThreshold('score', value);
        message.reply(`✅ Minimum score set: ${value}%`);
    }

    // Export as PDF/HTML
    if (message.content.startsWith('!archivist export')) {
        const format = message.content.split(' ')[2];
        const report = archivist.generateWeeklyReport();
        
        if (format === 'pdf') {
            // PDF Export (simplified)
            const markdown = archivist.exportToMarkdown(report);
            const filename = `highlights_${Date.now()}.md`;
            require('fs').writeFileSync(filename, markdown);
            message.reply(`📄 Markdown export created: \`${filename}\` (PDF feature in development)`);
        } else if (format === 'html') {
            // HTML Export (simplified)
            const markdown = archivist.exportToMarkdown(report);
            const html = `<!DOCTYPE html><html><head><title>Server Highlights</title></head><body><pre>${markdown}</pre></body></html>`;
            const filename = `highlights_${Date.now()}.html`;
            require('fs').writeFileSync(filename, html);
            message.reply(`🌐 HTML export created: \`${filename}\``);
        } else {
            message.reply('❌ Available formats: `pdf`, `html`');
        }
    }

    // Backup
    if (message.content === '!archivist backup') {
        try {
            const backupData = {
                highlights: archivist.db.prepare('SELECT * FROM highlights').all(),
                config: archivist.config,
                timestamp: new Date().toISOString()
            };
            
            const filename = `backup_${Date.now()}.json`;
            require('fs').writeFileSync(filename, JSON.stringify(backupData, null, 2));
            message.reply(`💾 Backup created: \`${filename}\``);
        } catch (error) {
            message.reply('❌ Error during backup!');
        }
    }

    // Clear (Admin only)
    if (message.content === '!archivist clear') {
        if (!message.member.permissions.has('ADMINISTRATOR')) {
            message.reply('❌ Only administrators can delete highlights!');
            return;
        }
        
        archivist.db.exec('DELETE FROM highlights');
        archivist.db.exec('DELETE FROM reactions');
        archivist.db.exec('DELETE FROM reports');
        message.reply('🗑️ All highlights deleted!');
    }

    // Gamemode on/off
    if (message.content.startsWith('!archivist gamemode')) {
        const action = message.content.split(' ')[2];
        const enabled = action === 'on';
        
        archivist.saveConfig('gamemode', enabled);
        message.reply(`🎮 Gamemode ${enabled ? 'enabled' : 'disabled'}`);
    }

    // Leaderboard
    if (message.content === '!archivist leaderboard') {
        const leaderboard = archivist.getLeaderboard(10);
        
        const embed = new EmbedBuilder()
            .setTitle('🏆 Highlight Leaderboard')
            .setDescription('Top Highlight-Kuratoren')
            .setColor(0xffd700)
            .setTimestamp();
        
        leaderboard.forEach((user, index) => {
            embed.addFields({
                name: `#${index + 1}`,
                value: `<@${user.user_id}> - ${user.points} points`,
                inline: true
            });
        });
        
        message.reply({ embeds: [embed] });
    }

    // User Points
    if (message.content.startsWith('!archivist points')) {
        const userMatch = message.content.match(/<@!?(\d+)>/);
        const userId = userMatch ? userMatch[1] : message.author.id;
        
        const userPoints = archivist.getUserPoints(userId);
        
        const embed = new EmbedBuilder()
            .setTitle('📊 User Points')
            .addFields(
                { name: 'User', value: `<@${userId}>`, inline: true },
                { name: 'Points', value: `${userPoints.points}`, inline: true },
                { name: 'Highlights erstellt', value: `${userPoints.highlights_created}`, inline: true },
                { name: 'Votes abgegeben', value: `${userPoints.votes_cast}`, inline: true }
            )
            .setColor(0x0099ff)
            .setTimestamp();
        
        message.reply({ embeds: [embed] });
    }

    // === PRIVACY & DATA PROTECTION COMMANDS ===
    
    // Opt-In for data collection
    if (message.content === '!privacy opt-in') {
        try {
            await archivist.setUserConsent(message.author.id, true);
            message.reply('✅ You have consented to data collection. Your messages will be analyzed anonymously.');
        } catch (error) {
            message.reply('❌ Error during opt-in!');
        }
    }

    // Opt-Out from data collection
    if (message.content === '!privacy opt-out') {
        try {
            await archivist.setUserConsent(message.author.id, false);
            // Delete all user data
            await archivist.deleteUserData(message.author.id);
            message.reply('✅ You have opted out of data collection. All your data has been deleted.');
        } catch (error) {
            message.reply('❌ Error during opt-out!');
        }
    }

    // Privacy-Status anzeigen
    if (message.content === '!privacy status') {
        try {
            const consent = await archivist.checkUserConsent(message.author.id);
                const status = consent === true ? '✅ Opt-In' : 
                              consent === false ? '❌ Opt-Out' : 
                              '❓ Not set';
            
            const embed = new EmbedBuilder()
                .setTitle('🔒 Privacy Status')
                .addFields(
                    { name: 'Your Status', value: status, inline: true },
                    { name: 'Data Collection', value: consent === true ? 'Active' : 'Inactive', inline: true },
                    { name: 'Data Deletion', value: 'Automatic after 30 days', inline: true }
                )
                .setColor(consent === true ? 0x00ff00 : 0xff0000)
                .setTimestamp();
            
            message.reply({ embeds: [embed] });
        } catch (error) {
            message.reply('❌ Error retrieving privacy status!');
        }
    }

    // Delete data (User)
    if (message.content === '!privacy delete-my-data') {
        try {
            await archivist.deleteUserData(message.author.id);
            message.reply('🗑️ All your data has been deleted!');
        } catch (error) {
            message.reply('❌ Error deleting your data!');
        }
    }

    // Privacy help
    if (message.content === '!privacy help') {
        const embed = new EmbedBuilder()
            .setTitle('🔒 Privacy & Data Protection')
            .setDescription('Your privacy is important to us!')
            .addFields(
                { name: '!privacy opt-in', value: 'Enable data collection', inline: true },
                { name: '!privacy opt-out', value: 'Disable data collection', inline: true },
                { name: '!privacy status', value: 'Show current status', inline: true },
                { name: '!privacy delete-my-data', value: 'Delete all your data', inline: true },
                { name: 'What is stored?', value: '• Anonymized messages\n• Sentiment scores\n• Reaction counts\n• NO user IDs or personal data', inline: false },
                { name: 'Data Protection', value: '• Automatic deletion after 30 days\n• Opt-in/opt-out anytime\n• No sharing with third parties', inline: false }
            )
            .setColor(0x0099ff)
            .setTimestamp();
        
        message.reply({ embeds: [embed] });
    }
});

// Start bot
console.log('🔄 Starting bot...');
console.log('🔄 Loading configuration...');
console.log('🔄 Connecting to Discord...');
client.login(config.token).catch(error => {
    console.error('❌ Error during bot startup:', error);
    process.exit(1);
});
