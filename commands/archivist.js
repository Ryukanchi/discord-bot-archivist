const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('archivist')
        .setDescription('Advanced archivist commands')
        .addSubcommand(subcommand =>
            subcommand
                .setName('leaderboard')
                .setDescription('Show highlight leaderboard'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('points')
                .setDescription('Show your points or another user\'s points')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('User to check points for')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('backup')
                .setDescription('Create a backup of highlights data'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('clear')
                .setDescription('Clear all highlights data (Admin only)'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('help')
                .setDescription('Show archivist help')),
    
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const archivist = interaction.client.archivist;

        try {
            switch (subcommand) {

                case 'leaderboard':
                    const leaderboard = archivist.getLeaderboard(10);
                    
                    const leaderboardEmbed = new EmbedBuilder()
                        .setTitle('🏆 Highlight Leaderboard')
                        .setDescription('Top highlight curators')
                        .setColor(0xffd700)
                        .setTimestamp();
                    
                    leaderboard.forEach((user, index) => {
                        leaderboardEmbed.addFields({
                            name: `#${index + 1}`,
                            value: `Anonymized ID: ...${user.user_id.slice(-6)} - ${user.points} points`,
                            inline: true
                        });
                    });
                    
                    await interaction.reply({ embeds: [leaderboardEmbed] });
                    break;

                case 'points':
                    const targetUser = interaction.options.getUser('user') || interaction.user;
                    const userPoints = archivist.getUserPoints(targetUser.id);
                    
                    const pointsEmbed = new EmbedBuilder()
                        .setTitle('📊 User Points')
                        .addFields(
                            { name: 'User', value: targetUser.username, inline: true },
                            { name: 'Points', value: `${userPoints.points}`, inline: true },
                            { name: 'Highlights Created', value: `${userPoints.highlights_created}`, inline: true },
                            { name: 'Votes Cast', value: `${userPoints.votes_cast}`, inline: true }
                        )
                        .setColor(0x0099ff)
                        .setTimestamp();
                    
                    await interaction.reply({ embeds: [pointsEmbed] });
                    break;

                case 'backup':
                    const backupData = {
                        highlights: archivist.db.prepare('SELECT * FROM highlights_anonymized').all(),
                        timestamp: new Date().toISOString()
                    };
                    
                    const filename = `backup_${Date.now()}.json`;
                    const fs = require('fs').promises;
                    await fs.writeFile(filename, JSON.stringify(backupData, null, 2));
                    
                    const backupEmbed = new EmbedBuilder()
                        .setTitle('💾 Backup Created')
                        .setDescription(`Backup file: \`${filename}\``)
                        .setColor(0x00ff00)
                        .setTimestamp();
                    
                    await interaction.reply({ embeds: [backupEmbed] });
                    break;

                case 'clear':
                    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                        await interaction.reply('❌ Only administrators can delete highlights!');
                        return;
                    }
                    
                    archivist.db.exec('DELETE FROM highlights_anonymized');
                    archivist.db.exec('DELETE FROM user_points');
                    archivist.db.exec('DELETE FROM user_privacy');
                    
                    const clearEmbed = new EmbedBuilder()
                        .setTitle('🗑️ Data Cleared')
                        .setDescription('All highlights data has been deleted!')
                        .setColor(0xff0000)
                        .setTimestamp();
                    
                    await interaction.reply({ embeds: [clearEmbed] });
                    break;

                case 'help':
                    const helpEmbed = new EmbedBuilder()
                        .setTitle('🤖 Server AI-Archivist')
                        .setDescription('Automatic highlight detection and archiving')
                        .addFields(
                            { name: '📊 Analysis', value: '/analyze - Analyzes messages', inline: true },
                            { name: '📅 Reports', value: '/weekly / /monthly - Shows highlights', inline: true },
                            { name: '📄 Export', value: '/export - Exports as Markdown', inline: true },
                            { name: '🎮 Gamification', value: '/archivist leaderboard - Show leaderboard', inline: true },
                            { name: '🏆 Points', value: '/archivist points - Show user points', inline: true }
                        )
                        .setColor(0x9932cc)
                        .setTimestamp();
                    
                    await interaction.reply({ embeds: [helpEmbed] });
                    break;
            }
        } catch (error) {
            await interaction.reply('❌ Error processing archivist command!');
        }
    },
};



