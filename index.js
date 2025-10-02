require('dotenv').config();
const { Client, GatewayIntentBits, Events, EmbedBuilder, Collection } = require('discord.js');
const ServerArchivist = require('./archivist.js');
const fs = require('fs');
const path = require('path');

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
client.archivist = archivist; // Make archivist available to commands
console.log('✅ Archivist successfully initialized');

// Load commands dynamically
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        console.log(`✅ Loaded command: ${command.data.name}`);
    } else {
        console.log(`⚠️  Command at ${filePath} is missing required "data" or "execute" property.`);
    }
}

// Bot is ready
client.once(Events.ClientReady, async readyClient => {
    console.log(`🤖 Bot is online! Logged in as ${readyClient.user.tag}`);
    console.log(`📊 Bot is active in ${client.guilds.cache.size} servers`);
    console.log(`✅ Archivist initialized`);
    console.log(`✅ All event listeners registered`);
    
    // Set bot status and activity from environment variables
    try {
        readyClient.user.setActivity(process.env.BOT_ACTIVITY_NAME, { type: process.env.BOT_ACTIVITY_TYPE });
        readyClient.user.setStatus(process.env.BOT_STATUS);
        console.log(`✅ Bot status set to ${process.env.BOT_STATUS} with activity: ${process.env.BOT_ACTIVITY_NAME}`);
    } catch (error) {
        console.error('❌ Error setting bot status/activity:', error);
    }
    
    // Register slash commands
    try {
        console.log('🔄 Registering slash commands...');
        const { REST, Routes } = require('discord.js');
        
        const commands = [];
        for (const [name, command] of client.commands) {
            commands.push(command.data.toJSON());
        }
        
        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
        
        console.log(`🔄 Started refreshing ${commands.length} application (/) commands.`);
        
        // Register commands globally
        const data = await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands },
        );
        
        console.log(`✅ Successfully reloaded ${data.length} application (/) commands.`);
    } catch (error) {
        console.error('❌ Error registering slash commands:', error);
    }
});

// Handle slash command interactions
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);

    if (!command) {
        console.error(`❌ No command matching ${interaction.commandName} was found.`);
        return;
    }

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(`❌ Error executing ${interaction.commandName}:`, error);
        
        const errorMessage = {
            content: '❌ There was an error while executing this command!',
            ephemeral: true
        };

        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(errorMessage);
        } else {
            await interaction.reply(errorMessage);
        }
    }
});

// Process messages for automatic highlight detection
client.on(Events.MessageCreate, async message => {
    // Ignore bot messages
    if (message.author.bot) return;

    try {
        // Automatically analyze messages for highlights
        const analysis = await archivist.analyzeMessage(message);
        
        // If it's a highlight, add points to user
        if (analysis.isHighlight) {
            archivist.addUserPoints(message.author.id, 10);
            console.log(`🎯 Highlight detected from ${message.author.username}: ${message.content.substring(0, 50)}...`);
        }
    } catch (error) {
        console.error('❌ Error analyzing message:', error);
    }
});

// Error handling
process.on('unhandledRejection', error => {
    console.error('❌ Unhandled promise rejection:', error);
});

process.on('uncaughtException', error => {
    console.error('❌ Uncaught exception:', error);
    process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('🔄 Shutting down gracefully...');
    archivist.close();
    client.destroy();
    process.exit(0);
});

// Start bot
console.log('🔄 Starting bot...');
console.log('🔄 Loading configuration...');
console.log('🔄 Connecting to Discord...');

if (!process.env.DISCORD_TOKEN) {
    console.error('❌ DISCORD_TOKEN not found in environment variables!');
    console.error('❌ Please create a .env file with your Discord bot token.');
    process.exit(1);
}

client.login(process.env.DISCORD_TOKEN).catch(error => {
    console.error('❌ Error during bot startup:', error);
    process.exit(1);
});
