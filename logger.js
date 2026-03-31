function formatMessage(level, message) {
  return `[Archivist] ${level.toUpperCase()}: ${message}`;
}

module.exports = {
  info(message, ...details) {
    console.log(formatMessage("info", message), ...details);
  },
  warn(message, ...details) {
    console.warn(formatMessage("warn", message), ...details);
  },
  error(message, ...details) {
    console.error(formatMessage("error", message), ...details);
  },
};
