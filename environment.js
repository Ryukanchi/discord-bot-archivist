const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const { validateDotenvPrivacySaltSource } = require("./privacy-salt.js");

function loadEnvironment(options = {}) {
  const envPath = options.path || path.resolve(process.cwd(), ".env");
  const processEnv = options.processEnv || process.env;
  const dotenvCanSetPrivacySalt =
    options.override === true ||
    !Object.prototype.hasOwnProperty.call(processEnv, "PRIVACY_SALT");

  if (dotenvCanSetPrivacySalt && fs.existsSync(envPath)) {
    validateDotenvPrivacySaltSource(fs.readFileSync(envPath, "utf8"));
  }

  return dotenv.config({ ...options, path: envPath, processEnv });
}

module.exports = { loadEnvironment };
