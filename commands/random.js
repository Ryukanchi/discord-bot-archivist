const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('random')
        .setDescription('Generates a random number between 1 and 100'),
    
    async execute(interaction) {
        const randomNumber = Math.floor(Math.random() * 100) + 1;
        
        const embed = new EmbedBuilder()
            .setTitle('🎲 Random Number')
            .setDescription(`Your random number is: **${randomNumber}**`)
            .setColor(0x9932cc)
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },
};

