// PRIVACY COMMANDS FOR DISCORD BOT
// ===================================

// Privacy commands to add to index.js:

const PRIVACY_COMMANDS = `
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
`;

module.exports = PRIVACY_COMMANDS;

