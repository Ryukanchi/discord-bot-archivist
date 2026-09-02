function resolveAllowedGuildId(env = process.env) {
  return env.ALLOWED_GUILD_ID || env.DEV_GUILD_ID || null;
}

function getGuildId(entity) {
  return (
    entity?.guildId ||
    entity?.guild?.id ||
    entity?.channel?.guildId ||
    entity?.channel?.guild?.id ||
    null
  );
}

function isAllowedGuildId(guildId, allowedGuildId) {
  return Boolean(allowedGuildId && guildId && guildId === allowedGuildId);
}

function isAllowedGuildEntity(entity, allowedGuildId) {
  return isAllowedGuildId(getGuildId(entity), allowedGuildId);
}

module.exports = {
  getGuildId,
  isAllowedGuildEntity,
  isAllowedGuildId,
  resolveAllowedGuildId,
};
