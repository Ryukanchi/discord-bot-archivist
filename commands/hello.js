const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('hello')
        .setDescription('Says hello back to you'),
    
    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('👋 Hello!')
            .setDescription(`Hello ${interaction.user.username}! Nice to meet you!`)
            .setColor(0x0099ff)
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },
};

