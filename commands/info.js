const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("info")
    .setDescription("Shows bot information and statistics"),

  async execute(interaction) {
    const client = interaction.client;
    const uptime = Math.floor(client.uptime / 1000);
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = uptime % 60;

    const embed = new EmbedBuilder()
      .setTitle("🤖 Bot Information")
      .addFields(
        { name: "Bot Name", value: client.user.username, inline: true },
        { name: "Server", value: interaction.guild.name, inline: true },
        { name: "User", value: interaction.user.username, inline: true },
        { name: "Ping", value: `${client.ws.ping}ms`, inline: true },
        {
          name: "Uptime",
          value: `${days}d ${hours}h ${minutes}m ${seconds}s`,
          inline: true,
        },
        {
          name: "Servers",
          value: `${client.guilds.cache.size}`,
          inline: true,
        },
        {
          name: "Discord.js Version",
          value: require("discord.js").version,
          inline: true,
        },
        { name: "Node.js Version", value: process.version, inline: true },
        {
          name: "Memory Usage",
          value: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
          inline: true,
        }
      )
      .setColor(0x0099ff)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
