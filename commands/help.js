const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Shows all available commands'),
    
    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('🤖 Bot Commands')
            .setDescription('Here are all available commands:')
            .addFields(
                { name: '/ping', value: 'Tests bot connection', inline: true },
                { name: '/hello', value: 'Says hello back', inline: true },
                { name: '/help', value: 'Shows this help', inline: true },
                { name: '/info', value: 'Shows bot information', inline: true },
                { name: '/random', value: 'Generates a random number', inline: true },
                { name: '/dice', value: 'Rolls dice with specific sides', inline: true },
                { name: '/analyze', value: 'Analyzes a message for highlights', inline: true },
                { name: '/weekly', value: 'Shows weekly highlights', inline: true },
                { name: '/monthly', value: 'Shows monthly highlights', inline: true },
                { name: '/export', value: 'Exports highlights as Markdown', inline: true },
                { name: '/privacy', value: 'Privacy and data protection commands', inline: true },
                { name: '/archivist', value: 'Advanced archivist commands', inline: true }
            )
            .setColor(0x00ff00)
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
    },
};

