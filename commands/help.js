const { SlashCommandBuilder } = require("discord.js");
const { createArchivistEmbed } = require("../embed-style.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Show the Archivist product guide"),

  async execute(interaction) {
    const embed = createArchivistEmbed({
      title: "Archivist Guide",
      description:
        "Archivist helps your community revisit the moments worth keeping, while giving admins a clean, privacy-safe control surface.",
    })
      .addFields(
        {
          name: "Main Entry Point",
          value:
            "`/archivist overview` opens the admin control center for highlights, monitoring, recap status, and system health.",
          inline: false,
        },
        {
          name: "Highlights",
          value:
            "`/weekly` revisit this week's saved moments\n`/archivist leaderboard` see who is creating memorable posts\n`/archivist threshold` tune reaction sensitivity",
          inline: false,
        },
        {
          name: "Memory And Analysis",
          value:
            "`/analyze` preview scoring for text\n`/archivist inspect` explain why a message was or was not highlighted",
          inline: false,
        },
        {
          name: "Privacy",
          value:
            "`/privacy consent` opt in or out\n`/privacy status` review your current consent\n`/privacy delete` remove your stored Archivist data\n`/archivist privacy` review stored and anonymized data",
          inline: false,
        },
        {
          name: "Admin And Health",
          value:
            "`/archivist overview` control center\n`/archivist health` runtime and database status\n`/archivist channel` include or exclude channels\n`/archivist autopost` configure automatic highlight posting",
          inline: false,
        },
        {
          name: "Weekly Recap",
          value:
            "`/archivist weekly` enable, disable, inspect status, or post the recap now",
          inline: false,
        },
        {
          name: "Moment Of The Day",
          value:
            "`/archivist motd` manage the daily featured moment, review status, or post one manually",
          inline: false,
        },
        {
          name: "Secondary Utilities",
          value:
            "`/info`, `/ping`, `/hello`, `/random`, and `/dice` are still available, but they are not part of the core Archivist workflow.",
          inline: false,
        },
      )
      .setFooter({ text: "Start with /archivist overview" })
      ;

    await interaction.reply({ embeds: [embed] });
  },
};
