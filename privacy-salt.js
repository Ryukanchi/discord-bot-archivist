const PRIVACY_SALT_PATTERN = /^[0-9A-Fa-f]{64}$/;
const PUBLIC_PRIVACY_SALT_PLACEHOLDERS = new Set([
  "your_random_secret_salt_here",
  "change_me",
  "changeme",
  "replace_me",
  "placeholder",
]);

function validatePrivacySalt(value, source) {
  const isPublicPlaceholder = PUBLIC_PRIVACY_SALT_PLACEHOLDERS.has(
    value.toLowerCase(),
  );
  if (isPublicPlaceholder) {
    throw new Error(
      `Invalid ${source}: public placeholder values are not secret. Omit PRIVACY_SALT to generate one or provide exactly 64 hexadecimal characters generated from 32 random bytes.`,
    );
  }
  if (!PRIVACY_SALT_PATTERN.test(value)) {
    throw new Error(
      `Invalid ${source}: expected exactly 64 hexadecimal characters generated from 32 random bytes.`,
    );
  }
  return value;
}

function validateDotenvPrivacySaltSource(contents) {
  const assignmentLines = String(contents)
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line) =>
      /^\s*(?:export\s+)?PRIVACY_SALT(?:\s*=|:\s+)/i.test(line),
    );

  if (assignmentLines.length === 0) {
    return;
  }

  if (
    assignmentLines.length !== 1 ||
    !/^PRIVACY_SALT=[0-9A-Fa-f]{64}$/.test(assignmentLines[0])
  ) {
    throw new Error(
      "Invalid .env PRIVACY_SALT assignment: omit the line to generate a private salt, or use exactly PRIVACY_SALT=<64 hexadecimal characters> with no quotes, spaces, comments, or duplicate assignments.",
    );
  }
}

module.exports = {
  validateDotenvPrivacySaltSource,
  validatePrivacySalt,
};
