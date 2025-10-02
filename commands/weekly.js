const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('weekly')
        .setDescription('Shows weekly highlights report'),
    
    async execute(interaction) {
        try {
            const archivist = interaction.client.archivist;
            const report = archivist.generateWeeklyReport();
            
            const embed = new EmbedBuilder()
                .setTitle('📅 Weekly Highlights')
                .setDescription(`**Period:** ${report.startDate.toLocaleDateString()} - ${report.endDate.toLocaleDateString()}`)
                .addFields(
                    { name: 'Number of Highlights', value: `${report.totalHighlights}`, inline: true },
                    { name: 'Top Highlight', value: report.highlights[0]?.anonymized_content || 'No highlights', inline: false }
                )
                .setColor(0x0099ff)
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            await interaction.reply('❌ Error generating report!');
        }
    },
};

