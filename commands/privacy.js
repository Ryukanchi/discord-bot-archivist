const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('privacy')
        .setDescription('Manage Archivist privacy consent (opt-in)')
        .addSubcommand(sc => sc
            .setName('consent')
            .setDescription('Give or revoke consent')
            .addStringOption(o => o
                .setName('value')
                .setDescription('on or off')
                .setRequired(true)
                .addChoices({ name: 'on', value: 'on' }, { name: 'off', value: 'off' })))
        .addSubcommand(sc => sc
            .setName('status')
            .setDescription('Show your current consent status')),
    async execute(interaction) {
        const a = interaction.client.archivist;
        const userId = interaction.user.id;

        if (interaction.options.getSubcommand() === 'consent') {
            const allow = interaction.options.getString('value') === 'on';
            await a.setUserConsent(userId, allow);
            const e = new EmbedBuilder()
                .setTitle('Privacy')
                .setDescription(allow
                    ? '✅ Consent **ON** — your messages may be analyzed.'
                    : '❌ Consent **OFF** — your messages will **not** be analyzed.')
                .setColor(allow ? 0x22c55e : 0xef4444);
            return interaction.reply({ embeds: [e], ephemeral: true });
        }

        if (interaction.options.getSubcommand() === 'status') {
            const status = await a.checkUserConsent(userId);
            const e = new EmbedBuilder()
                .setTitle('Privacy Status')
                .setDescription(status === true ? '✅ ON' : '❌ OFF')
                .setColor(status === true ? 0x22c55e : 0xef4444);
            return interaction.reply({ embeds: [e], ephemeral: true });
        }
    }
};