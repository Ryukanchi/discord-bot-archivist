const { loadEnvironment } = require("./environment.js");

loadEnvironment();

const {
  Client,
  GatewayIntentBits,
  Events,
  Collection,
  Partials,
  REST,
  Routes,
} = require("discord.js");
const fs = require("fs");
const path = require("path");

const ServerArchivist = require("./archivist.js");
const logger = require("./logger.js");
const { createRuntime } = require("./runtime.js");
const { isAllowedGuildId, resolveAllowedGuildId } = require("./guild-scope.js");

function parseNumericEnv(name, fallback, options = {}) {
  const rawValue = process.env[name];
  if (rawValue == null || rawValue === "") {
    return fallback;
  }

  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a valid number.`);
  }

  if (options.min != null && parsed < options.min) {
    throw new Error(`${name} must be greater than or equal to ${options.min}.`);
  }

  if (options.max != null && parsed > options.max) {
    throw new Error(`${name} must be less than or equal to ${options.max}.`);
  }

  return parsed;
}

function validateConfiguration() {
  if (!process.env.DISCORD_TOKEN) {
    throw new Error("DISCORD_TOKEN is required.");
  }

  const allowedGuildId = resolveAllowedGuildId();
  if (!allowedGuildId) {
    throw new Error(
      "ALLOWED_GUILD_ID is required so Archivist cannot mix data between Discord servers.",
    );
  }

  if (!/^\d{17,20}$/.test(allowedGuildId)) {
    throw new Error("ALLOWED_GUILD_ID must be a valid Discord server ID.");
  }

  if (process.env.BOT_ACTIVITY_TYPE) {
    const supportedTypes = new Set([
      "PLAYING",
      "STREAMING",
      "LISTENING",
      "WATCHING",
      "COMPETING",
    ]);
    if (!supportedTypes.has(process.env.BOT_ACTIVITY_TYPE)) {
      throw new Error(
        `BOT_ACTIVITY_TYPE must be one of: ${Array.from(supportedTypes).join(", ")}.`,
      );
    }
  }

  parseNumericEnv("REACTION_THRESHOLD", 3, { min: 1 });
  parseNumericEnv("MIN_SCORE", 0.6, { min: 0, max: 1 });
  parseNumericEnv("DATA_RETENTION_DAYS", 30, { min: 1 });
  parseNumericEnv("MOTD_POST_HOUR", 12, { min: 0, max: 23 });
}

function createClient() {
  return new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMessageReactions,
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
  });
}

function loadCommands(client) {
  client.commands = new Collection();
  const commandsPath = path.join(__dirname, "commands");
  const commandFiles = fs
    .readdirSync(commandsPath)
    .filter((file) => file.endsWith(".js"));

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);

    if ("data" in command && "execute" in command) {
      if (client.commands.has(command.data.name)) {
        throw new Error(
          `Duplicate slash command name detected: ${command.data.name} (${file}).`,
        );
      }
      client.commands.set(command.data.name, command);
      continue;
    }

    logger.warn(
      `Skipped ${file} because it does not export both data and execute.`,
    );
  }
}

async function replaceCommandSet(rest, route, body, label) {
  const data = await rest.put(route, { body });
  logger.info(`Registered ${data.length} ${label} slash command(s).`);
  return data;
}

async function clearGuildCommandOverrides(client, rest, allowedGuildId) {
  const guilds = Array.from(client.guilds.cache.values());

  for (const guild of guilds) {
    if (guild.id === allowedGuildId) {
      continue;
    }

    await rest.put(Routes.applicationGuildCommands(client.user.id, guild.id), {
      body: [],
    });
    logger.info(`Cleared guild-specific slash commands for ${guild.id}.`);
  }
}

async function registerSlashCommands(client) {
  const commands = Array.from(client.commands.values(), (command) =>
    command.data.toJSON(),
  );
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  const allowedGuildId = client.archivist.allowedGuildId;

  await replaceCommandSet(
    rest,
    Routes.applicationGuildCommands(client.user.id, allowedGuildId),
    commands,
    `guild (${allowedGuildId})`,
  );
  await replaceCommandSet(
    rest,
    Routes.applicationCommands(client.user.id),
    [],
    "global",
  );
  await clearGuildCommandOverrides(client, rest, allowedGuildId);
}

function registerLifecycleHandlers(client, archivist, runtime) {
  client.once(Events.ClientReady, async (readyClient) => {
    logger.info(`Connected as ${readyClient.user.tag}.`);
    logger.info(`Serving ${client.guilds.cache.size} guild(s).`);

    try {
      if (process.env.BOT_ACTIVITY_NAME && process.env.BOT_ACTIVITY_TYPE) {
        readyClient.user.setActivity(process.env.BOT_ACTIVITY_NAME, {
          type: process.env.BOT_ACTIVITY_TYPE,
        });
      }
      if (process.env.BOT_STATUS) {
        readyClient.user.setStatus(process.env.BOT_STATUS);
      }
    } catch (error) {
      logger.warn("Failed to apply bot presence configuration.", error);
    }

    try {
      await registerSlashCommands(client);
    } catch (error) {
      logger.error("Failed to register slash commands.", error);
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!isAllowedGuildId(interaction.guildId, archivist.allowedGuildId)) {
      if (interaction.isRepliable?.()) {
        await interaction.reply({
          content: "Archivist is configured for a different Discord server.",
          ephemeral: true,
        });
      }
      return;
    }

    if (interaction.isButton()) {
      for (const command of client.commands.values()) {
        if (typeof command.handleComponent !== "function") {
          continue;
        }

        try {
          const handled = await command.handleComponent(interaction);
          if (handled) {
            return;
          }
        } catch (error) {
          logger.error("A component interaction failed.", error);
          const errorMessage = {
            content: "An unexpected error occurred while handling this action.",
            ephemeral: true,
          };

          if (interaction.replied || interaction.deferred) {
            await interaction.followUp(errorMessage);
          } else {
            await interaction.reply(errorMessage);
          }
          return;
        }
      }
    }

    if (!interaction.isChatInputCommand()) {
      return;
    }

    const command = client.commands.get(interaction.commandName);
    if (!command) {
      logger.warn(
        `Received an interaction for unknown command ${interaction.commandName}.`,
      );
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      logger.error(`Command ${interaction.commandName} failed.`, error);
      const errorMessage = {
        content: "An unexpected error occurred while running this command.",
        ephemeral: true,
      };

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorMessage);
      } else {
        await interaction.reply(errorMessage);
      }
    }
  });

  process.on("unhandledRejection", (error) => {
    logger.error("Unhandled promise rejection detected.", error);
  });

  process.on("uncaughtException", (error) => {
    logger.error("Uncaught exception detected. The process will exit.", error);
    runtime.stopBackgroundJobs?.();
    archivist.close();
    client.destroy();
    process.exit(1);
  });

  process.on("SIGINT", () => {
    logger.info("Received SIGINT. Shutting down gracefully.");
    runtime.stopBackgroundJobs?.();
    archivist.close();
    client.destroy();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    logger.info("Received SIGTERM. Shutting down gracefully.");
    runtime.stopBackgroundJobs?.();
    archivist.close();
    client.destroy();
    process.exit(0);
  });
}

async function main() {
  validateConfiguration();

  const allowedGuildId = resolveAllowedGuildId();
  const client = createClient();
  const archivist = new ServerArchivist({ allowedGuildId });
  const runtime = createRuntime({ archivist, logger, allowedGuildId });

  Object.defineProperty(client, "allowedGuildId", {
    value: allowedGuildId,
    writable: false,
    configurable: false,
    enumerable: true,
  });
  client.archivist = archivist;
  client.runtime = runtime;

  loadCommands(client);
  registerLifecycleHandlers(client, archivist, runtime);
  runtime.registerEventHandlers(client);

  logger.info("Starting the Discord bot.");
  await client.login(process.env.DISCORD_TOKEN);
}

main().catch((error) => {
  logger.error("Bot startup failed.", error);
  process.exit(1);
});
