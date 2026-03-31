const { EmbedBuilder } = require("discord.js");

const EMBED_COLORS = Object.freeze({
  primary: 0x2563eb,
  success: 0x16a34a,
  warm: 0xf59e0b,
  violet: 0x7c3aed,
  danger: 0xdc2626,
  muted: 0x6b7280,
});

function createArchivistEmbed({ title, description, color = "primary" }) {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(EMBED_COLORS[color] || EMBED_COLORS.primary)
    .setFooter({ text: "Archivist" })
    .setTimestamp();
}

function trimText(value, maxLength = 280) {
  if (!value) {
    return "No message content was available.";
  }

  return value.length > maxLength
    ? `${value.slice(0, maxLength - 3)}...`
    : value;
}

module.exports = {
  EMBED_COLORS,
  createArchivistEmbed,
  trimText,
};
