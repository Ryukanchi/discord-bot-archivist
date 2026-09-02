const { SlashCommandBuilder, version: discordVersion } = require("discord.js");
const { createArchivistEmbed } = require("../embed-style.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("info")
    .setDescription("Show Archivist runtime and deployment details"),

  async execute(interaction) {
    const client = interaction.client;
    const uptimeSeconds = Math.floor(client.uptime / 1000);
    const days = Math.floor(uptimeSeconds / 86400);
    const hours = Math.floor((uptimeSeconds % 86400) / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const seconds = uptimeSeconds % 60;

    const embed = createArchivistEmbed({
      title: "Archivist Runtime",
      description:
        "A quick operational snapshot of Archivist, the current server, and the running environment.",
    }).addFields(
      { name: "Bot", value: client.user.username, inline: true },
      { name: "Guild", value: interaction.guild.name, inline: true },
      { name: "User", value: interaction.user.username, inline: true },
      { name: "Ping", value: `${client.ws.ping}ms`, inline: true },
      {
        name: "Uptime",
        value: `${days}d ${hours}h ${minutes}m ${seconds}s`,
        inline: true,
      },
      {
        name: "Connected Guilds",
        value: `${client.guilds.cache.size}`,
        inline: true,
      },
      {
        name: "discord.js",
        value: discordVersion,
        inline: true,
      },
      { name: "Node.js", value: process.version, inline: true },
      {
        name: "Heap Usage",
        value: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
        inline: true,
      },
    );

    await interaction.reply({ embeds: [embed] });
  },
};
