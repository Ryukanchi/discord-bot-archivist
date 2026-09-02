const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { EventEmitter } = require("node:events");
const Database = require("better-sqlite3");
const { ReactionType } = require("discord.js");

const ServerArchivist = require("./archivist.js");
const { loadEnvironment } = require("./environment.js");
const { createMessageRefreshQueue, createRuntime } = require("./runtime.js");
const archivistCommand = require("./commands/archivist.js");
const weeklyCommand = require("./commands/weekly.js");

const TEST_PRIVACY_SALT = "a".repeat(64);
const ALTERNATE_TEST_PRIVACY_SALT = "b".repeat(64);

function restoreEnv(previousEnv) {
  for (const [key, value] of Object.entries(previousEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function createReactionCache(totalCount) {
  const users = new Map(
    Array.from({ length: totalCount }, (_, index) => {
      const user = createUser({ id: `reactor-${index + 1}` });
      return [user.id, user];
    }),
  );

  return new Map([
    [
      "default",
      {
        count: totalCount,
        users: {
          cache: users,
          async fetch() {
            return users;
          },
        },
      },
    ],
  ]);
}

function createReaction(users) {
  const cache = new Map(users.map((user) => [user.id, user]));
  return {
    count: users.length,
    users: {
      cache,
      async fetch() {
        return cache;
      },
    },
  };
}

function createUser(overrides = {}) {
  return {
    id: overrides.id || "user-1",
    username: overrides.username || "ArchivistUser",
    bot: overrides.bot || false,
    createDM: overrides.createDM || (async () => ({ send: async () => {} })),
  };
}

function createChannel(overrides = {}) {
  return {
    id: overrides.id || "channel-1",
    type: overrides.type || "GuildText",
    name: overrides.name || "general",
    messages: overrides.messages || {
      async fetch(messageId) {
        return buildMessage({ id: messageId });
      },
    },
  };
}

function createGuild(overrides = {}) {
  return {
    id: overrides.id || "guild-1",
    name: overrides.name || "Archivist Guild",
  };
}

function buildMessage(overrides = {}) {
  return {
    id: overrides.id || "message-1",
    content: overrides.content ?? "wow this archivist test should pop off",
    author: overrides.author || createUser(),
    channel: overrides.channel || createChannel(),
    guild: overrides.guild || createGuild(),
    reactions: overrides.reactions || { cache: createReactionCache(0) },
    partial: overrides.partial || false,
    fetch:
      overrides.fetch ||
      async function fetch() {
        return { ...this, partial: false };
      },
  };
}

function withArchivistEnvironment() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "archivist-test-"));
  const previousEnv = {
    DATABASE_PATH: process.env.DATABASE_PATH,
    PRIVACY_SALT: process.env.PRIVACY_SALT,
    MIN_SCORE: process.env.MIN_SCORE,
    REACTION_THRESHOLD: process.env.REACTION_THRESHOLD,
    KEYWORDS: process.env.KEYWORDS,
    AUTO_DELETE_ENABLED: process.env.AUTO_DELETE_ENABLED,
    MOTD_ENABLED: process.env.MOTD_ENABLED,
    MOTD_CHANNEL_ID: process.env.MOTD_CHANNEL_ID,
    MOTD_POST_HOUR: process.env.MOTD_POST_HOUR,
    ALLOWED_GUILD_ID: process.env.ALLOWED_GUILD_ID,
    DEV_GUILD_ID: process.env.DEV_GUILD_ID,
    LEGACY_GUILD_ID: process.env.LEGACY_GUILD_ID,
  };

  process.env.DATABASE_PATH = path.join(tempDir, "highlights.db");
  process.env.PRIVACY_SALT = TEST_PRIVACY_SALT;
  process.env.MIN_SCORE = "0.2";
  process.env.REACTION_THRESHOLD = "3";
  process.env.KEYWORDS = "wow,test";
  process.env.AUTO_DELETE_ENABLED = "false";
  process.env.MOTD_ENABLED = "true";
  process.env.MOTD_CHANNEL_ID = "motd-channel";
  process.env.MOTD_POST_HOUR = "12";
  process.env.ALLOWED_GUILD_ID = "guild-1";
  delete process.env.DEV_GUILD_ID;
  delete process.env.LEGACY_GUILD_ID;

  return {
    tempDir,
    cleanup() {
      restoreEnv(previousEnv);
      fs.rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

async function grantConsent(archivist, userId = "user-1") {
  await archivist.setUserConsent(userId, true);
}

test("persists the privacy salt with owner-only permissions", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "archivist-salt-"));
  const previousEnv = {
    DATABASE_PATH: process.env.DATABASE_PATH,
    PRIVACY_SALT: process.env.PRIVACY_SALT,
    ALLOWED_GUILD_ID: process.env.ALLOWED_GUILD_ID,
    DEV_GUILD_ID: process.env.DEV_GUILD_ID,
    LEGACY_GUILD_ID: process.env.LEGACY_GUILD_ID,
  };

  let archivist;

  try {
    process.env.DATABASE_PATH = path.join(tempDir, "salt-test.db");
    delete process.env.PRIVACY_SALT;
    process.env.ALLOWED_GUILD_ID = "guild-1";
    delete process.env.DEV_GUILD_ID;
    delete process.env.LEGACY_GUILD_ID;

    archivist = new ServerArchivist();
    const saltFilePath = path.join(tempDir, ".privacy_salt");
    const generatedSalt = archivist.privacySalt;
    archivist.close();
    archivist = null;

    assert.match(generatedSalt, /^[0-9a-f]{64}$/);
    assert.equal(fs.existsSync(saltFilePath), true);
    assert.equal(fs.readFileSync(saltFilePath, "utf8"), generatedSalt);

    if (process.platform !== "win32") {
      const mode = fs.statSync(saltFilePath).mode & 0o777;
      assert.equal(mode, 0o600);
    }

    archivist = new ServerArchivist();
    assert.equal(archivist.privacySalt, generatedSalt);
  } finally {
    archivist?.close();
    restoreEnv(previousEnv);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("accepts an exact 32-byte hex privacy salt without changing it", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "archivist-env-salt-"));
  const previousEnv = {
    DATABASE_PATH: process.env.DATABASE_PATH,
    PRIVACY_SALT: process.env.PRIVACY_SALT,
    ALLOWED_GUILD_ID: process.env.ALLOWED_GUILD_ID,
    DEV_GUILD_ID: process.env.DEV_GUILD_ID,
    LEGACY_GUILD_ID: process.env.LEGACY_GUILD_ID,
  };
  const configuredSalt = "0123456789ABCDEF".repeat(4);
  let archivist;

  try {
    process.env.DATABASE_PATH = path.join(tempDir, "valid-env-salt.db");
    process.env.PRIVACY_SALT = configuredSalt;
    process.env.ALLOWED_GUILD_ID = "guild-valid-env-salt";
    delete process.env.DEV_GUILD_ID;
    delete process.env.LEGACY_GUILD_ID;

    archivist = new ServerArchivist();
    const firstHash = archivist.hashUserId("123456789012345678");
    assert.equal(archivist.privacySalt, configuredSalt);
    archivist.close();
    archivist = new ServerArchivist();
    assert.equal(archivist.privacySalt, configuredSalt);
    assert.equal(archivist.hashUserId("123456789012345678"), firstHash);
  } finally {
    archivist?.close();
    restoreEnv(previousEnv);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("refuses to replace a missing privacy salt for an existing database", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "archivist-missing-existing-salt-"),
  );
  const databasePath = path.join(tempDir, "existing.db");
  const saltFilePath = path.join(tempDir, ".privacy_salt");
  const previousEnv = {
    DATABASE_PATH: process.env.DATABASE_PATH,
    PRIVACY_SALT: process.env.PRIVACY_SALT,
    ALLOWED_GUILD_ID: process.env.ALLOWED_GUILD_ID,
    DEV_GUILD_ID: process.env.DEV_GUILD_ID,
    LEGACY_GUILD_ID: process.env.LEGACY_GUILD_ID,
  };
  let archivist;

  try {
    process.env.DATABASE_PATH = databasePath;
    process.env.PRIVACY_SALT = TEST_PRIVACY_SALT;
    process.env.ALLOWED_GUILD_ID = "guild-existing-salt";
    delete process.env.DEV_GUILD_ID;
    delete process.env.LEGACY_GUILD_ID;

    archivist = new ServerArchivist();
    await archivist.setUserConsent("existing-user", true);
    const originalHash = archivist.hashUserId("existing-user");
    archivist.close();
    archivist = null;
    assert.equal(fs.existsSync(saltFilePath), false);
    const databaseBeforeFailedRestart = fs.readFileSync(databasePath);

    delete process.env.PRIVACY_SALT;
    assert.throws(
      () => new ServerArchivist(),
      /Missing privacy salt for an existing database/,
    );
    assert.equal(fs.existsSync(saltFilePath), false);
    assert.deepEqual(
      fs.readFileSync(databasePath),
      databaseBeforeFailedRestart,
    );

    process.env.PRIVACY_SALT = TEST_PRIVACY_SALT;
    archivist = new ServerArchivist();
    assert.equal(archivist.hashUserId("existing-user"), originalHash);
    assert.equal(await archivist.checkUserConsent("existing-user"), 1);
  } finally {
    archivist?.close();
    restoreEnv(previousEnv);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("rejects unsafe configured privacy salts before creating a database", () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "archivist-invalid-env-salt-"),
  );
  const previousEnv = {
    DATABASE_PATH: process.env.DATABASE_PATH,
    PRIVACY_SALT: process.env.PRIVACY_SALT,
    ALLOWED_GUILD_ID: process.env.ALLOWED_GUILD_ID,
    DEV_GUILD_ID: process.env.DEV_GUILD_ID,
    LEGACY_GUILD_ID: process.env.LEGACY_GUILD_ID,
  };
  const invalidSalts = [
    "",
    "your_random_secret_salt_here",
    " ",
    "a".repeat(63),
    "a".repeat(65),
    "g".repeat(64),
    `${TEST_PRIVACY_SALT}\n`,
    `\uFEFF${TEST_PRIVACY_SALT}`,
  ];

  try {
    const persistedSaltPath = path.join(tempDir, ".privacy_salt");
    fs.writeFileSync(persistedSaltPath, ALTERNATE_TEST_PRIVACY_SALT);
    process.env.ALLOWED_GUILD_ID = "guild-invalid-env-salt";
    delete process.env.DEV_GUILD_ID;
    delete process.env.LEGACY_GUILD_ID;

    invalidSalts.forEach((invalidSalt, index) => {
      const databasePath = path.join(tempDir, `invalid-${index}.db`);
      process.env.DATABASE_PATH = databasePath;
      process.env.PRIVACY_SALT = invalidSalt;

      assert.throws(() => new ServerArchivist(), /Invalid PRIVACY_SALT/);
      assert.equal(fs.existsSync(databasePath), false);
      assert.equal(
        fs.readFileSync(persistedSaltPath, "utf8"),
        ALTERNATE_TEST_PRIVACY_SALT,
      );
    });
  } finally {
    restoreEnv(previousEnv);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("rejects an invalid persisted privacy salt without replacing it", () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "archivist-invalid-file-salt-"),
  );
  const previousEnv = {
    DATABASE_PATH: process.env.DATABASE_PATH,
    PRIVACY_SALT: process.env.PRIVACY_SALT,
    ALLOWED_GUILD_ID: process.env.ALLOWED_GUILD_ID,
    DEV_GUILD_ID: process.env.DEV_GUILD_ID,
    LEGACY_GUILD_ID: process.env.LEGACY_GUILD_ID,
  };
  const invalidFileSalts = ["", "   ", "short", `${TEST_PRIVACY_SALT}\n\n`];

  try {
    delete process.env.PRIVACY_SALT;
    process.env.ALLOWED_GUILD_ID = "guild-invalid-file-salt";
    delete process.env.DEV_GUILD_ID;
    delete process.env.LEGACY_GUILD_ID;

    invalidFileSalts.forEach((invalidSalt, index) => {
      const caseDir = path.join(tempDir, `case-${index}`);
      const databasePath = path.join(caseDir, "invalid-file-salt.db");
      const saltFilePath = path.join(caseDir, ".privacy_salt");
      fs.mkdirSync(caseDir);
      fs.writeFileSync(saltFilePath, invalidSalt);
      process.env.DATABASE_PATH = databasePath;

      assert.throws(() => new ServerArchivist(), /Invalid privacy salt file/);
      assert.equal(fs.readFileSync(saltFilePath, "utf8"), invalidSalt);
      assert.equal(fs.existsSync(databasePath), false);
    });
  } finally {
    restoreEnv(previousEnv);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("accepts one trailing newline in a persisted privacy salt", () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "archivist-file-salt-newline-"),
  );
  const previousEnv = {
    DATABASE_PATH: process.env.DATABASE_PATH,
    PRIVACY_SALT: process.env.PRIVACY_SALT,
    ALLOWED_GUILD_ID: process.env.ALLOWED_GUILD_ID,
    DEV_GUILD_ID: process.env.DEV_GUILD_ID,
    LEGACY_GUILD_ID: process.env.LEGACY_GUILD_ID,
  };
  let archivist;

  try {
    process.env.DATABASE_PATH = path.join(tempDir, "file-salt-newline.db");
    delete process.env.PRIVACY_SALT;
    process.env.ALLOWED_GUILD_ID = "guild-file-salt-newline";
    delete process.env.DEV_GUILD_ID;
    delete process.env.LEGACY_GUILD_ID;
    fs.writeFileSync(
      path.join(tempDir, ".privacy_salt"),
      `${ALTERNATE_TEST_PRIVACY_SALT}\r\n`,
    );

    archivist = new ServerArchivist();
    assert.equal(archivist.privacySalt, ALTERNATE_TEST_PRIVACY_SALT);
  } finally {
    archivist?.close();
    restoreEnv(previousEnv);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("rejects dotenv privacy salt normalization bypasses", () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "archivist-dotenv-salt-"),
  );
  const invalidAssignments = [
    "PRIVACY_SALT=",
    "PRIVACY_SALT=   ",
    "PRIVACY_SALT=your_random_secret_salt_here",
    `privacy_salt=${TEST_PRIVACY_SALT}`,
    `PRIVACY_SALT= ${TEST_PRIVACY_SALT}`,
    `PRIVACY_SALT=${TEST_PRIVACY_SALT} `,
    `PRIVACY_SALT="${TEST_PRIVACY_SALT}"`,
    `PRIVACY_SALT=${TEST_PRIVACY_SALT} # managed secret`,
    `PRIVACY_SALT=${TEST_PRIVACY_SALT}\nPRIVACY_SALT=${ALTERNATE_TEST_PRIVACY_SALT}`,
    `PRIVACY_SALT=${TEST_PRIVACY_SALT}\nprivacy_salt=${ALTERNATE_TEST_PRIVACY_SALT}`,
    `\uFEFFPRIVACY_SALT=${TEST_PRIVACY_SALT}`,
  ];

  try {
    invalidAssignments.forEach((assignment, index) => {
      const envPath = path.join(tempDir, `.env-${index}`);
      const processEnv = {};
      fs.writeFileSync(envPath, `${assignment}\n`);

      assert.throws(
        () => loadEnvironment({ path: envPath, processEnv }),
        /Invalid \.env PRIVACY_SALT assignment/,
      );
      assert.equal(processEnv.PRIVACY_SALT, undefined);
    });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("normal startup rejects a whitespace-only dotenv salt before database creation", () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "archivist-index-dotenv-salt-"),
  );
  const databasePath = path.join(tempDir, "must-not-exist.db");
  const childEnv = { ...process.env };
  for (const name of [
    "PRIVACY_SALT",
    "DATABASE_PATH",
    "DISCORD_TOKEN",
    "ALLOWED_GUILD_ID",
    "DEV_GUILD_ID",
    "LEGACY_GUILD_ID",
  ]) {
    delete childEnv[name];
  }

  try {
    fs.writeFileSync(
      path.join(tempDir, ".env"),
      [
        "DISCORD_TOKEN=integration-test-token",
        "ALLOWED_GUILD_ID=123456789012345678",
        `DATABASE_PATH=${databasePath}`,
        "PRIVACY_SALT=   ",
      ].join("\n"),
    );

    const child = spawnSync(
      process.execPath,
      [path.join(__dirname, "index.js")],
      {
        cwd: tempDir,
        env: childEnv,
        encoding: "utf8",
      },
    );

    assert.notEqual(child.status, 0);
    assert.match(
      `${child.stdout}\n${child.stderr}`,
      /Invalid \.env PRIVACY_SALT assignment/,
    );
    assert.equal(fs.existsSync(databasePath), false);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("loads only an exact unquoted dotenv privacy salt assignment", () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "archivist-valid-dotenv-salt-"),
  );
  const envPath = path.join(tempDir, ".env");
  const processEnv = {};

  try {
    fs.writeFileSync(envPath, `PRIVACY_SALT=${TEST_PRIVACY_SALT}\n`);
    const result = loadEnvironment({ path: envPath, processEnv });

    assert.equal(result.error, undefined);
    assert.equal(processEnv.PRIVACY_SALT, TEST_PRIVACY_SALT);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test(
  "git ignore rules protect SQLite database artifacts without hiding unrelated files",
  {
    skip: spawnSync("git", ["--version"], { encoding: "utf8" }).status !== 0,
  },
  () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "archivist-gitignore-"),
    );
    const ignoredPaths = [
      "highlights.db",
      "highlights.db-wal",
      "highlights.db-shm",
      "highlights.db-journal",
      "nested/data/highlights.db",
      "nested/data/highlights.db-wal",
      "nested/data/highlights.db-shm",
      "nested/data/highlights.db-journal",
    ];
    const visiblePaths = [
      "notes.txt",
      "report.db-backup",
      "schema.db-example",
      "archive.sqlite-wal",
    ];

    try {
      fs.copyFileSync(
        path.join(__dirname, ".gitignore"),
        path.join(tempDir, ".gitignore"),
      );
      const init = spawnSync("git", ["-C", tempDir, "init", "--quiet"], {
        encoding: "utf8",
      });
      assert.equal(init.status, 0, init.stderr);

      for (const relativePath of [...ignoredPaths, ...visiblePaths]) {
        const absolutePath = path.join(tempDir, relativePath);
        fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
        fs.writeFileSync(absolutePath, "test artifact");
      }

      for (const relativePath of ignoredPaths) {
        const result = spawnSync(
          "git",
          [
            "-C",
            tempDir,
            "-c",
            "core.ignoreCase=false",
            "check-ignore",
            "--quiet",
            "--",
            relativePath,
          ],
          { encoding: "utf8" },
        );
        assert.equal(result.status, 0, `${relativePath} was not ignored`);
      }

      for (const relativePath of visiblePaths) {
        const result = spawnSync(
          "git",
          [
            "-C",
            tempDir,
            "-c",
            "core.ignoreCase=false",
            "check-ignore",
            "--quiet",
            "--",
            relativePath,
          ],
          { encoding: "utf8" },
        );
        assert.equal(
          result.status,
          1,
          `${relativePath} was unexpectedly ignored`,
        );
      }
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  },
);

test(
  "keeps SQLite database and WAL sidecars owner-only across restart",
  { skip: process.platform === "win32" },
  () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "archivist-mode-"));
    const databasePath = path.join(tempDir, "archive.db");
    const databaseFiles = [
      databasePath,
      `${databasePath}-wal`,
      `${databasePath}-shm`,
    ];
    const previousEnv = {
      DATABASE_PATH: process.env.DATABASE_PATH,
      PRIVACY_SALT: process.env.PRIVACY_SALT,
      ALLOWED_GUILD_ID: process.env.ALLOWED_GUILD_ID,
      DEV_GUILD_ID: process.env.DEV_GUILD_ID,
      LEGACY_GUILD_ID: process.env.LEGACY_GUILD_ID,
      AUTO_DELETE_ENABLED: process.env.AUTO_DELETE_ENABLED,
    };
    fs.chmodSync(tempDir, 0o755);
    const previousUmask = process.umask(0o022);
    let archivist;

    try {
      process.env.DATABASE_PATH = path.relative(process.cwd(), databasePath);
      process.env.PRIVACY_SALT = TEST_PRIVACY_SALT;
      process.env.ALLOWED_GUILD_ID = "guild-mode-test";
      process.env.AUTO_DELETE_ENABLED = "false";
      delete process.env.DEV_GUILD_ID;
      delete process.env.LEGACY_GUILD_ID;

      archivist = new ServerArchivist();
      assert.equal(process.umask(), 0o022);
      archivist.setReactionThreshold(7);
      assert.equal(fs.statSync(tempDir).mode & 0o777, 0o755);
      for (const file of databaseFiles) {
        assert.equal(fs.existsSync(file), true);
        assert.equal(fs.statSync(file).mode & 0o777, 0o600);
      }
      archivist.db.pragma("wal_checkpoint(TRUNCATE)");
      for (const file of databaseFiles) {
        assert.equal(fs.statSync(file).mode & 0o777, 0o600);
      }
      archivist.db.pragma("journal_mode = DELETE");
      assert.equal(fs.existsSync(`${databasePath}-wal`), false);
      assert.equal(fs.existsSync(`${databasePath}-shm`), false);
      archivist.db.pragma("journal_mode = WAL");
      archivist.setReactionThreshold(8);
      for (const file of databaseFiles) {
        assert.equal(fs.existsSync(file), true);
        assert.equal(fs.statSync(file).mode & 0o777, 0o600);
      }
      archivist.close();
      archivist = null;

      fs.chmodSync(databasePath, 0o644);
      archivist = new ServerArchivist();
      assert.equal(process.umask(), 0o022);
      assert.equal(archivist.getReactionThreshold(), 8);
      assert.equal(fs.statSync(tempDir).mode & 0o777, 0o755);
      for (const file of databaseFiles) {
        assert.equal(fs.existsSync(file), true);
        assert.equal(fs.statSync(file).mode & 0o777, 0o600);
      }
    } finally {
      archivist?.close();
      process.umask(previousUmask);
      restoreEnv(previousEnv);
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  },
);

test(
  "repairs permissions on a database with crash-leftover WAL files",
  { skip: process.platform === "win32" },
  () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "archivist-dirty-mode-"),
    );
    const databasePath = path.join(tempDir, "archive.db");
    const databaseFiles = [
      databasePath,
      `${databasePath}-wal`,
      `${databasePath}-shm`,
    ];
    const previousEnv = {
      DATABASE_PATH: process.env.DATABASE_PATH,
      PRIVACY_SALT: process.env.PRIVACY_SALT,
      ALLOWED_GUILD_ID: process.env.ALLOWED_GUILD_ID,
      DEV_GUILD_ID: process.env.DEV_GUILD_ID,
      LEGACY_GUILD_ID: process.env.LEGACY_GUILD_ID,
      AUTO_DELETE_ENABLED: process.env.AUTO_DELETE_ENABLED,
    };
    const childEnv = {
      ...process.env,
      DATABASE_PATH: databasePath,
      PRIVACY_SALT: ALTERNATE_TEST_PRIVACY_SALT,
      ALLOWED_GUILD_ID: "guild-dirty-mode-test",
      AUTO_DELETE_ENABLED: "false",
      ARCHIVIST_MODULE_PATH: path.join(process.cwd(), "archivist.js"),
    };
    delete childEnv.DEV_GUILD_ID;
    delete childEnv.LEGACY_GUILD_ID;
    let archivist;

    try {
      const child = spawnSync(
        process.execPath,
        [
          "-e",
          `
            const fs = require("node:fs");
            process.umask(0o022);
            const ServerArchivist = require(process.env.ARCHIVIST_MODULE_PATH);
            const archivist = new ServerArchivist();
            archivist.setReactionThreshold(9);
            for (const file of [
              process.env.DATABASE_PATH,
              process.env.DATABASE_PATH + "-wal",
              process.env.DATABASE_PATH + "-shm",
            ]) {
              fs.chmodSync(file, 0o644);
            }
            process.exit(0);
          `,
        ],
        { cwd: process.cwd(), env: childEnv, encoding: "utf8" },
      );
      assert.equal(child.status, 0, child.stderr);
      for (const file of databaseFiles) {
        assert.equal(fs.existsSync(file), true);
        assert.equal(fs.statSync(file).mode & 0o777, 0o644);
      }

      process.env.DATABASE_PATH = databasePath;
      process.env.PRIVACY_SALT = childEnv.PRIVACY_SALT;
      process.env.ALLOWED_GUILD_ID = childEnv.ALLOWED_GUILD_ID;
      process.env.AUTO_DELETE_ENABLED = "false";
      delete process.env.DEV_GUILD_ID;
      delete process.env.LEGACY_GUILD_ID;
      archivist = new ServerArchivist();

      assert.equal(archivist.getReactionThreshold(), 9);
      for (const file of databaseFiles) {
        assert.equal(fs.existsSync(file), true);
        assert.equal(fs.statSync(file).mode & 0o777, 0o600);
      }
    } finally {
      archivist?.close();
      restoreEnv(previousEnv);
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  },
);

test("keeps in-memory SQLite databases compatible with file hardening", () => {
  const previousEnv = {
    DATABASE_PATH: process.env.DATABASE_PATH,
    PRIVACY_SALT: process.env.PRIVACY_SALT,
    ALLOWED_GUILD_ID: process.env.ALLOWED_GUILD_ID,
    DEV_GUILD_ID: process.env.DEV_GUILD_ID,
    LEGACY_GUILD_ID: process.env.LEGACY_GUILD_ID,
    AUTO_DELETE_ENABLED: process.env.AUTO_DELETE_ENABLED,
  };
  let archivist;

  try {
    process.env.DATABASE_PATH = ":memory:";
    process.env.PRIVACY_SALT = TEST_PRIVACY_SALT;
    process.env.ALLOWED_GUILD_ID = "guild-in-memory-mode-test";
    process.env.AUTO_DELETE_ENABLED = "false";
    delete process.env.DEV_GUILD_ID;
    delete process.env.LEGACY_GUILD_ID;

    archivist = new ServerArchivist();
    archivist.setReactionThreshold(11);
    assert.equal(archivist.getReactionThreshold(), 11);
    assert.equal(
      archivist.db
        .pragma("database_list")
        .find((database) => database.name === "main").file,
      "",
    );
  } finally {
    archivist?.close();
    restoreEnv(previousEnv);
  }
});

test(
  "fails closed when owner-only database permissions cannot be enforced",
  { skip: process.platform === "win32" },
  () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "archivist-mode-failure-"),
    );
    const previousEnv = {
      DATABASE_PATH: process.env.DATABASE_PATH,
      PRIVACY_SALT: process.env.PRIVACY_SALT,
      ALLOWED_GUILD_ID: process.env.ALLOWED_GUILD_ID,
      DEV_GUILD_ID: process.env.DEV_GUILD_ID,
      LEGACY_GUILD_ID: process.env.LEGACY_GUILD_ID,
      AUTO_DELETE_ENABLED: process.env.AUTO_DELETE_ENABLED,
    };
    const originalChmodSync = fs.chmodSync;
    const expectedUmask = process.umask();

    try {
      process.env.DATABASE_PATH = path.join(tempDir, "mode-failure.db");
      process.env.PRIVACY_SALT = TEST_PRIVACY_SALT;
      process.env.ALLOWED_GUILD_ID = "guild-mode-failure-test";
      process.env.AUTO_DELETE_ENABLED = "false";
      delete process.env.DEV_GUILD_ID;
      delete process.env.LEGACY_GUILD_ID;
      fs.chmodSync = (file, mode) => {
        if (path.basename(file) === "mode-failure.db") {
          const error = new Error("synthetic permission failure");
          error.code = "EPERM";
          throw error;
        }
        return originalChmodSync(file, mode);
      };

      assert.throws(
        () => new ServerArchivist(),
        /Could not enforce owner-only permissions for SQLite file/,
      );
      assert.equal(process.umask(), expectedUmask);
    } finally {
      fs.chmodSync = originalChmodSync;
      restoreEnv(previousEnv);
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  },
);

test("records a highlight once and keeps point totals stable across repeated processing", async () => {
  const env = withArchivistEnvironment();
  const archivist = new ServerArchivist();
  const message = buildMessage({
    content: "wow first draft of the highlight",
    reactions: { cache: createReactionCache(5) },
  });

  const firstResult = await archivist.recordMessage(message, {
    bypassConsent: true,
  });
  const secondResult = await archivist.recordMessage(message, {
    bypassConsent: true,
  });

  const rows = archivist.db
    .prepare("SELECT * FROM highlights_anonymized WHERE hashed_message_id = ?")
    .all(archivist.hashUserId(message.id));
  const points = archivist.getUserPoints(message.author.id);

  assert.equal(firstResult.becameHighlight, true);
  assert.equal(secondResult.becameHighlight, false);
  assert.equal(rows.length, 1);
  assert.equal(points.points, 10);
  assert.equal(points.highlights_created, 1);

  archivist.close();
  env.cleanup();
});

test("revokes points when a highlight falls below the threshold", async () => {
  const env = withArchivistEnvironment();
  const archivist = new ServerArchivist();
  const messageId = "message-demotion";

  await archivist.recordMessage(
    buildMessage({
      id: messageId,
      content: "wow initial highlight",
      reactions: { cache: createReactionCache(5) },
    }),
    { bypassConsent: true },
  );

  const demotion = await archivist.recordMessage(
    buildMessage({
      id: messageId,
      content: "plain follow-up",
      reactions: { cache: createReactionCache(0) },
    }),
    { bypassConsent: true },
  );

  const points = archivist.getUserPoints("user-1");
  assert.equal(demotion.lostHighlight, true);
  assert.equal(points.points, 0);
  assert.equal(points.highlights_created, 0);
  assert.equal(
    archivist.db
      .prepare(
        "SELECT COUNT(*) AS count FROM highlights_anonymized WHERE hashed_message_id = ?",
      )
      .get(archivist.hashUserId(messageId)).count,
    0,
  );

  archivist.close();
  env.cleanup();
});

test("does not persist ordinary messages that never become highlights", async () => {
  const env = withArchivistEnvironment();
  process.env.MIN_SCORE = "0.6";
  process.env.KEYWORDS = "quux,zorb,flarn";
  const archivist = new ServerArchivist();
  const message = buildMessage({
    id: "ordinary-message",
    content: "an ordinary community update",
    reactions: { cache: createReactionCache(0) },
  });

  const result = await archivist.recordMessage(message, {
    bypassConsent: true,
  });

  assert.equal(result.isHighlight, false);
  assert.equal(
    archivist.db
      .prepare(
        "SELECT COUNT(*) AS count FROM highlights_anonymized WHERE hashed_message_id = ?",
      )
      .get(archivist.hashUserId(message.id)).count,
    0,
  );
  assert.equal(archivist.createBackupPayload().highlights.length, 0);

  archivist.close();
  env.cleanup();
});

test("removes stored highlights and adjusts points after message deletion", async () => {
  const env = withArchivistEnvironment();
  const archivist = new ServerArchivist();
  const message = buildMessage({
    id: "message-delete",
    content: "wow this should be deleted later",
    reactions: { cache: createReactionCache(4) },
  });

  await archivist.recordMessage(message, { bypassConsent: true });
  const removal = archivist.removeStoredMessage(message.id);
  const rows = archivist.db
    .prepare("SELECT * FROM highlights_anonymized WHERE hashed_message_id = ?")
    .all(archivist.hashUserId(message.id));

  assert.equal(removal.removed, true);
  assert.equal(removal.removedHighlight, true);
  assert.equal(rows.length, 0);
  assert.equal(archivist.getUserPoints(message.author.id).points, 0);

  archivist.close();
  env.cleanup();
});

test("respects SQLite boolean consent values and keeps email anonymization intact", async () => {
  const env = withArchivistEnvironment();
  const archivist = new ServerArchivist();
  const user = createUser({ id: "consenting-user", username: "Consent" });

  archivist.db
    .prepare("INSERT INTO user_privacy (user_id, consent) VALUES (?, ?)")
    .run(archivist.hashUserId(user.id), 1);

  const result = await archivist.analyzeMessage(
    buildMessage({
      id: "consent-message",
      author: user,
      content: "email me at bob@example.com and ping @Alice",
    }),
  );

  const anonymized = archivist.anonymizeContent(
    "email me at bob@example.com and ping @Alice",
  );

  assert.equal(result.reason, "processed");
  assert.equal(anonymized.includes("[EMAIL]"), true);
  assert.equal(anonymized.includes("bob@[USER].com"), false);
  assert.equal(anonymized.includes("@[USER]"), true);

  archivist.close();
  env.cleanup();
});

test("keeps preview analysis side-effect free", async () => {
  const env = withArchivistEnvironment();
  const archivist = new ServerArchivist();
  const preview = await archivist.analyzeMessage(
    buildMessage({
      id: "preview-message",
      content: "wow preview only",
      reactions: { cache: createReactionCache(8) },
    }),
    { bypassConsent: true },
  );

  const rows = archivist.db
    .prepare("SELECT * FROM highlights_anonymized")
    .all();
  assert.equal(preview.isHighlight, true);
  assert.equal(rows.length, 0);

  archivist.close();
  env.cleanup();
});

test("respects include and exclude channel rules when scoring messages", async () => {
  const env = withArchivistEnvironment();
  const archivist = new ServerArchivist();
  const includedChannel = createChannel({ id: "channel-included" });
  const excludedChannel = createChannel({ id: "channel-excluded" });

  archivist.setChannelRule(includedChannel.id, "include");
  archivist.setChannelRule(excludedChannel.id, "exclude");

  const ignored = await archivist.recordMessage(
    buildMessage({
      id: "message-excluded",
      channel: excludedChannel,
      content: "wow this should stay out of storage",
      reactions: { cache: createReactionCache(5) },
    }),
    { bypassConsent: true },
  );

  const accepted = await archivist.recordMessage(
    buildMessage({
      id: "message-included",
      channel: includedChannel,
      content: "wow this should be monitored",
      reactions: { cache: createReactionCache(5) },
    }),
    { bypassConsent: true },
  );

  assert.equal(ignored.reason, "channel-not-monitored");
  assert.equal(accepted.isHighlight, true);
  assert.equal(archivist.getHighlightCount(), 1);

  archivist.close();
  env.cleanup();
});

test("uses the configured reaction threshold in highlight scoring", async () => {
  const env = withArchivistEnvironment();
  const archivist = new ServerArchivist();
  archivist.setReactionThreshold(8);

  const lowReactionAnalysis = await archivist.analyzeMessage(
    buildMessage({
      id: "threshold-message",
      content: "wow threshold test",
      reactions: { cache: createReactionCache(4) },
    }),
    { bypassConsent: true },
  );

  assert.equal(lowReactionAnalysis.reactionThreshold, 8);
  assert.equal(lowReactionAnalysis.contributions.reactions < 0.3, true);

  archivist.close();
  env.cleanup();
});

test("counts unique human non-author reaction voters across emoji", async () => {
  const env = withArchivistEnvironment();
  process.env.MIN_SCORE = "0.6";
  process.env.REACTION_THRESHOLD = "3";
  process.env.KEYWORDS = "quux,zorb,flarn";
  const archivist = new ServerArchivist();
  const repeatedVoter = createUser({ id: "repeated-voter" });
  const author = createUser({ id: "message-author" });
  const bot = createUser({ id: "reaction-bot", bot: true });
  const content = "quux zorb flarn neutral archive text ".padEnd(120, "x");

  const analysis = await archivist.analyzeMessage(
    buildMessage({
      id: "duplicate-reaction-probe",
      author,
      content,
      reactions: {
        cache: new Map([
          ["one", createReaction([repeatedVoter, author])],
          ["two", createReaction([repeatedVoter, bot])],
          ["three", createReaction([repeatedVoter])],
        ]),
      },
    }),
    { bypassConsent: true },
  );

  assert.equal(analysis.reactionCount, 1);
  assert.equal(analysis.isHighlight, false);

  archivist.close();
  env.cleanup();
});

test("reaction fetch failures fail closed instead of trusting cached or aggregate counts", async () => {
  const env = withArchivistEnvironment();
  process.env.MIN_SCORE = "0.6";
  process.env.REACTION_THRESHOLD = "3";
  process.env.KEYWORDS = "quux,zorb,flarn";
  const archivist = new ServerArchivist();
  const cachedVoter = createUser({ id: "cached-voter" });
  const content = "quux zorb flarn neutral archive text ".padEnd(120, "x");

  const analysis = await archivist.analyzeMessage(
    buildMessage({
      id: "failed-reaction-fetch-probe",
      content,
      reactions: {
        cache: new Map([
          [
            "one",
            {
              count: 50,
              users: {
                cache: new Map([[cachedVoter.id, cachedVoter]]),
                async fetch() {
                  throw new Error("simulated Discord fetch failure");
                },
              },
            },
          ],
        ]),
      },
    }),
    { bypassConsent: true },
  );

  assert.equal(analysis.reactionCount, 0);
  assert.equal(analysis.isHighlight, false);

  archivist.close();
  env.cleanup();
});

test("counts normal and super-reaction voters without duplicates", async () => {
  const env = withArchivistEnvironment();
  process.env.MIN_SCORE = "0.6";
  process.env.REACTION_THRESHOLD = "3";
  process.env.KEYWORDS = "quux,zorb,flarn";
  const archivist = new ServerArchivist();
  const normalVoter = createUser({ id: "normal-voter" });
  const burstVoter = createUser({ id: "burst-voter" });
  const normalUsers = new Map([[normalVoter.id, normalVoter]]);
  const burstUsers = new Map([
    [normalVoter.id, normalVoter],
    [burstVoter.id, burstVoter],
  ]);
  const content = "quux zorb flarn neutral archive text ".padEnd(120, "x");

  const analysis = await archivist.analyzeMessage(
    buildMessage({
      id: "super-reaction-probe",
      content,
      reactions: {
        cache: new Map([
          [
            "one",
            {
              users: {
                cache: new Map(),
                async fetch(options) {
                  return options.type === ReactionType.Burst
                    ? burstUsers
                    : normalUsers;
                },
              },
            },
          ],
        ]),
      },
    }),
    { bypassConsent: true },
  );

  assert.equal(analysis.reactionCount, 2);
  assert.equal(analysis.isHighlight, false);

  archivist.close();
  env.cleanup();
});

test("serializes runtime work per message in a high-traffic scenario", async () => {
  const env = withArchivistEnvironment();
  const archivist = new ServerArchivist();
  await grantConsent(archivist);
  const logs = [];
  const runtime = createRuntime({
    archivist,
    logger: {
      info(message) {
        logs.push(message);
      },
      warn() {},
      error() {},
    },
  });

  const hotMessage = buildMessage({
    id: "hot-message",
    content: "wow high traffic highlight",
    reactions: { cache: createReactionCache(10) },
  });

  await Promise.all(
    Array.from({ length: 25 }, () =>
      runtime.processMessage({ ...hotMessage }, "stress test"),
    ),
  );

  const rows = archivist.db
    .prepare("SELECT * FROM highlights_anonymized WHERE hashed_message_id = ?")
    .all(archivist.hashUserId(hotMessage.id));
  const points = archivist.getUserPoints(hotMessage.author.id);

  assert.equal(rows.length, 1);
  assert.equal(points.points, 10);
  assert.equal(points.highlights_created, 1);
  assert.equal(runtime.queue.size(), 0);
  assert.equal(logs.length >= 1, true);

  archivist.close();
  env.cleanup();
});

test("coalesces reaction churn before repeated voter enumeration", async () => {
  const env = withArchivistEnvironment();
  const archivist = new ServerArchivist();
  await grantConsent(archivist);
  const recordMessage = archivist.recordMessage.bind(archivist);
  let evaluations = 0;
  archivist.recordMessage = async (...args) => {
    evaluations += 1;
    return recordMessage(...args);
  };
  const runtime = createRuntime({
    archivist,
    logger: { info() {}, warn() {}, error() {} },
  });
  const voter = createUser({ id: "reaction-churn-voter" });
  const voterPage = new Map([[voter.id, voter]]);
  let voterFetches = 0;
  let releaseFirstFetch;
  const firstFetchGate = new Promise((resolve) => {
    releaseFirstFetch = resolve;
  });
  const reactions = new Map(
    Array.from({ length: 20 }, (_, index) => [
      `reaction-${index}`,
      {
        count: 1,
        users: {
          cache: new Map(),
          async fetch() {
            voterFetches += 1;
            if (voterFetches === 1) {
              await firstFetchGate;
            }
            return voterPage;
          },
        },
      },
    ]),
  );
  const message = buildMessage({
    id: "reaction-churn-message",
    content: "quiet reaction churn probe",
    reactions: { cache: reactions },
  });
  const reaction = { partial: false, message };

  const first = runtime.processReaction(reaction, voter, "messageReactionAdd");
  await new Promise((resolve) => setImmediate(resolve));
  const churn = Array.from({ length: 24 }, (_, index) =>
    runtime.processReaction(
      reaction,
      voter,
      index % 2 === 0 ? "messageReactionRemove" : "messageReactionAdd",
    ),
  );
  releaseFirstFetch();
  const results = await Promise.all([first, ...churn]);

  assert.equal(results.at(-1).reactionCount, 1);
  assert.equal(evaluations, 2);
  assert.equal(voterFetches, 80);

  archivist.close();
  env.cleanup();
});

test("coalesces message update churn before repeated voter enumeration", async () => {
  const env = withArchivistEnvironment();
  const archivist = new ServerArchivist();
  await grantConsent(archivist);
  const recordMessage = archivist.recordMessage.bind(archivist);
  let evaluations = 0;
  archivist.recordMessage = async (...args) => {
    evaluations += 1;
    return recordMessage(...args);
  };
  const runtime = createRuntime({
    archivist,
    logger: { info() {}, warn() {}, error() {} },
  });
  const voter = createUser({ id: "update-churn-voter" });
  const voterPage = new Map([[voter.id, voter]]);
  let voterFetches = 0;
  let releaseFirstFetch;
  const firstFetchGate = new Promise((resolve) => {
    releaseFirstFetch = resolve;
  });
  const reactions = new Map(
    Array.from({ length: 20 }, (_, index) => [
      `update-reaction-${index}`,
      {
        count: 1,
        users: {
          cache: new Map(),
          async fetch() {
            voterFetches += 1;
            if (voterFetches === 1) {
              await firstFetchGate;
            }
            return voterPage;
          },
        },
      },
    ]),
  );
  const message = buildMessage({
    id: "update-churn-message",
    content: "quiet update churn probe",
    reactions: { cache: reactions },
  });

  const first = runtime.processUpdate(message, { ...message });
  await new Promise((resolve) => setImmediate(resolve));
  const churn = Array.from({ length: 24 }, (_, index) =>
    runtime.processUpdate(message, {
      ...message,
      content: `quiet update churn probe ${index}`,
    }),
  );
  releaseFirstFetch();
  const results = await Promise.all([first, ...churn]);

  assert.equal(results.at(-1).reactionCount, 1);
  assert.equal(evaluations, 2);
  assert.equal(voterFetches, 80);

  archivist.close();
  env.cleanup();
});

test("bounds message refresh scheduling and keeps only the latest pending state", async () => {
  const refreshQueue = createMessageRefreshQueue({
    maxConcurrent: 1,
    maxMessages: 2,
  });
  const executions = [];
  let releaseHotMessage;
  const hotMessageGate = new Promise((resolve) => {
    releaseHotMessage = resolve;
  });

  const hotActive = refreshQueue.run("hot-message", async () => {
    executions.push("hot-active");
    await hotMessageGate;
    return "hot-active";
  });
  await new Promise((resolve) => setImmediate(resolve));
  const hotPending = refreshQueue.run("hot-message", async () => {
    executions.push("hot-stale");
    return "hot-stale";
  });
  const hotLatest = refreshQueue.run("hot-message", async () => {
    executions.push("hot-latest");
    return "hot-latest";
  });
  const coldMessage = refreshQueue.run("cold-message", async () => {
    executions.push("cold-message");
    return "cold-message";
  });
  const overflow = refreshQueue.run("overflow-message", async () =>
    Promise.resolve("must-not-run"),
  );

  assert.equal(hotPending, hotLatest);
  assert.equal(overflow, null);
  assert.deepEqual(refreshQueue.getStats(), {
    active: 1,
    coalesced: 2,
    dropped: 1,
    pending: 1,
    trackedMessages: 2,
  });

  releaseHotMessage();
  assert.equal(await hotActive, "hot-active");
  assert.equal(await coldMessage, "cold-message");
  assert.equal(await hotLatest, "hot-latest");
  assert.deepEqual(executions, ["hot-active", "cold-message", "hot-latest"]);
  assert.equal(refreshQueue.size(), 0);
});

test("cleans message refresh scheduler state after failures and cancellation", async () => {
  const refreshQueue = createMessageRefreshQueue({
    maxConcurrent: 1,
    maxMessages: 2,
  });

  await assert.rejects(
    refreshQueue.run("failed-message", async () => {
      throw new Error("synthetic reaction failure");
    }),
    /synthetic reaction failure/,
  );
  assert.equal(refreshQueue.size(), 0);

  let releaseCancelledTask;
  const cancelledTaskGate = new Promise((resolve) => {
    releaseCancelledTask = resolve;
  });
  const cancelled = refreshQueue.run(
    "cancelled-message",
    async ({ isCancelled }) => {
      await cancelledTaskGate;
      return isCancelled() ? "stale" : "unexpected";
    },
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(refreshQueue.cancel("cancelled-message"), true);
  for (let index = 0; index < 100; index += 1) {
    const pending = refreshQueue.run(`pending-${index}`, async () =>
      Promise.resolve("must-not-run"),
    );
    assert.notEqual(pending, null);
    assert.equal(refreshQueue.cancel(`pending-${index}`), true);
    assert.equal(await pending, null);
  }
  assert.deepEqual(refreshQueue.getStats(), {
    active: 1,
    coalesced: 0,
    dropped: 0,
    pending: 0,
    trackedMessages: 1,
  });
  releaseCancelledTask();
  assert.equal(await cancelled, null);
  assert.equal(refreshQueue.size(), 0);
  assert.equal(
    await refreshQueue.run("cancelled-message", async () => "recovered"),
    "recovered",
  );
});

test("persists the latest message state after coalesced reaction churn", async () => {
  const env = withArchivistEnvironment();
  const archivist = new ServerArchivist();
  await grantConsent(archivist);
  const runtime = createRuntime({
    archivist,
    logger: { info() {}, warn() {}, error() {} },
  });
  const voter = createUser({ id: "latest-state-voter" });
  let releaseFirstEvaluation;
  const firstEvaluationGate = new Promise((resolve) => {
    releaseFirstEvaluation = resolve;
  });
  const firstMessage = buildMessage({
    id: "latest-reaction-state",
    content: "plain first state",
    reactions: {
      cache: new Map([
        [
          "first-state",
          {
            count: 1,
            users: {
              cache: new Map(),
              async fetch() {
                await firstEvaluationGate;
                return new Map([[voter.id, voter]]);
              },
            },
          },
        ],
      ]),
    },
  });
  const middleMessage = buildMessage({
    id: firstMessage.id,
    content: "plain stale middle state",
    reactions: { cache: createReactionCache(0) },
  });
  const latestMessage = buildMessage({
    id: firstMessage.id,
    content: "wow test latest state",
    reactions: { cache: createReactionCache(3) },
  });

  const first = runtime.processReaction(
    { partial: false, message: firstMessage },
    voter,
    "messageReactionAdd",
  );
  await new Promise((resolve) => setImmediate(resolve));
  const middle = runtime.processReaction(
    { partial: false, message: middleMessage },
    voter,
    "messageReactionRemove",
  );
  const latest = runtime.processReaction(
    { partial: false, message: latestMessage },
    voter,
    "messageReactionAdd",
  );
  releaseFirstEvaluation();
  const [, middleResult, latestResult] = await Promise.all([
    first,
    middle,
    latest,
  ]);
  const stored = archivist.db
    .prepare("SELECT * FROM highlights_anonymized WHERE hashed_message_id = ?")
    .get(archivist.hashUserId(firstMessage.id));

  assert.equal(middleResult, latestResult);
  assert.equal(latestResult.isHighlight, true);
  assert.equal(stored.anonymized_content, latestMessage.content);
  assert.equal(runtime.refreshQueue.size(), 0);
  assert.equal(runtime.getHealthSnapshot().messageRefreshesCoalesced, 2);

  archivist.close();
  env.cleanup();
});

test("runs the latest reaction refresh after partial hydration fails", async () => {
  const env = withArchivistEnvironment();
  const archivist = new ServerArchivist();
  await grantConsent(archivist);
  const runtime = createRuntime({
    archivist,
    logger: { info() {}, warn() {}, error() {} },
  });
  const messageId = "reaction-after-hydration-failure";
  let releaseFailedHydration;
  const failedHydrationGate = new Promise((resolve) => {
    releaseFailedHydration = resolve;
  });
  const partialReaction = {
    partial: true,
    message: buildMessage({ id: messageId }),
    async fetch() {
      await failedHydrationGate;
      throw new Error("synthetic hydration failure");
    },
  };
  const latestMessage = buildMessage({
    id: messageId,
    content: "wow test state after hydration failure",
    reactions: { cache: createReactionCache(3) },
  });

  const failed = runtime.processReaction(
    partialReaction,
    createUser({ id: "hydration-voter-1" }),
    "messageReactionAdd",
  );
  await new Promise((resolve) => setImmediate(resolve));
  const latest = runtime.processReaction(
    { partial: false, message: latestMessage },
    createUser({ id: "hydration-voter-2" }),
    "messageReactionRemove",
  );
  releaseFailedHydration();

  assert.equal(await failed, null);
  assert.equal((await latest).isHighlight, true);
  assert.equal(runtime.refreshQueue.size(), 0);

  archivist.close();
  env.cleanup();
});

test("reaction gates still avoid voter fetches for ineligible messages", async () => {
  const env = withArchivistEnvironment();
  const archivist = new ServerArchivist();
  const runtime = createRuntime({
    archivist,
    logger: { info() {}, warn() {}, error() {} },
  });
  let voterFetches = 0;
  const reactions = {
    cache: new Map([
      [
        "guarded-reaction",
        {
          count: 1,
          users: {
            cache: new Map(),
            async fetch() {
              voterFetches += 1;
              return new Map();
            },
          },
        },
      ],
    ]),
  };
  const missingConsent = buildMessage({
    id: "reaction-without-consent",
    author: createUser({ id: "no-consent-author" }),
    reactions,
  });
  const excludedChannel = createChannel({ id: "excluded-reaction-channel" });
  archivist.setChannelRule(excludedChannel.id, "exclude");
  await grantConsent(archivist);
  const excluded = buildMessage({
    id: "reaction-in-excluded-channel",
    channel: excludedChannel,
    reactions,
  });

  const missingConsentResult = await runtime.processReaction(
    { partial: false, message: missingConsent },
    createUser({ id: "guard-voter-1" }),
    "messageReactionAdd",
  );
  const excludedResult = await runtime.processReaction(
    { partial: false, message: excluded },
    createUser({ id: "guard-voter-2" }),
    "messageReactionAdd",
  );

  assert.equal(missingConsentResult.reason, "consent-not-granted");
  assert.equal(excludedResult.reason, "channel-not-monitored");
  assert.equal(voterFetches, 0);

  archivist.close();
  env.cleanup();
});

test("message deletion cancels a pending reaction refresh", async () => {
  const env = withArchivistEnvironment();
  const archivist = new ServerArchivist();
  await grantConsent(archivist);
  const runtime = createRuntime({
    archivist,
    logger: { info() {}, warn() {}, error() {} },
  });
  const message = buildMessage({
    id: "deleted-during-reaction-backlog",
    content: "wow deletion must remain final",
    reactions: { cache: createReactionCache(4) },
  });
  await runtime.processMessage(message, "messageCreate");

  let releaseBlockers;
  const blockerGate = new Promise((resolve) => {
    releaseBlockers = resolve;
  });
  const blockers = Array.from({ length: 4 }, (_, index) =>
    runtime.refreshQueue.run(`blocker-${index}`, async () => blockerGate),
  );
  await new Promise((resolve) => setImmediate(resolve));
  const pendingReaction = runtime.processReaction(
    { partial: false, message },
    createUser({ id: "deletion-race-voter" }),
    "messageReactionRemove",
  );
  const deletion = await runtime.processDeletion(message, "messageDelete");

  assert.equal(deletion.removed, true);
  assert.equal(await pendingReaction, null);
  releaseBlockers();
  await Promise.all(blockers);
  const unknownMessage = new Error("Unknown Message");
  unknownMessage.code = 10008;
  const lateReaction = await runtime.processReaction(
    {
      partial: true,
      message: { ...message, partial: true },
      async fetch() {
        throw unknownMessage;
      },
    },
    createUser({ id: "late-deletion-voter" }),
    "messageReactionAdd",
  );
  assert.equal(lateReaction, null);
  assert.equal(
    archivist.db
      .prepare(
        "SELECT COUNT(*) AS count FROM highlights_anonymized WHERE hashed_message_id = ?",
      )
      .get(archivist.hashUserId(message.id)).count,
    0,
  );
  assert.equal(runtime.refreshQueue.size(), 0);

  archivist.close();
  env.cleanup();
});

test("message updates can promote and later demote a highlight", async () => {
  const env = withArchivistEnvironment();
  const archivist = new ServerArchivist();
  await grantConsent(archivist);
  const runtime = createRuntime({
    archivist,
    logger: { info() {}, warn() {}, error() {} },
  });

  const initialMessage = buildMessage({
    id: "update-message",
    content: "plain update",
    reactions: { cache: createReactionCache(0) },
  });
  const promotedMessage = buildMessage({
    id: "update-message",
    content: "wow updated into a highlight",
    reactions: { cache: createReactionCache(6) },
  });
  const demotedMessage = buildMessage({
    id: "update-message",
    content: "quiet follow-up",
    reactions: { cache: createReactionCache(0) },
  });

  await runtime.processMessage(initialMessage, "messageCreate");
  const rowsAfterInitial = archivist.db
    .prepare(
      "SELECT COUNT(*) AS count FROM highlights_anonymized WHERE hashed_message_id = ?",
    )
    .get(archivist.hashUserId(initialMessage.id)).count;
  const promoted = await runtime.processUpdate(initialMessage, promotedMessage);
  const rowsAfterPromotion = archivist.db
    .prepare(
      "SELECT COUNT(*) AS count FROM highlights_anonymized WHERE hashed_message_id = ?",
    )
    .get(archivist.hashUserId(initialMessage.id)).count;
  const demoted = await runtime.processUpdate(promotedMessage, demotedMessage);
  const rowsAfterDemotion = archivist.db
    .prepare(
      "SELECT COUNT(*) AS count FROM highlights_anonymized WHERE hashed_message_id = ?",
    )
    .get(archivist.hashUserId(initialMessage.id)).count;

  assert.equal(promoted.becameHighlight, true);
  assert.equal(demoted.lostHighlight, true);
  assert.equal(archivist.getUserPoints(initialMessage.author.id).points, 0);
  assert.equal(rowsAfterInitial, 0);
  assert.equal(rowsAfterPromotion, 1);
  assert.equal(rowsAfterDemotion, 0);

  archivist.close();
  env.cleanup();
});

test("clearing a highlighted message removes its stored row and points", async () => {
  const env = withArchivistEnvironment();
  const archivist = new ServerArchivist();
  await grantConsent(archivist);
  const runtime = createRuntime({
    archivist,
    logger: { info() {}, warn() {}, error() {} },
  });
  const highlightedMessage = buildMessage({
    id: "cleared-highlight",
    content: "wow this starts as a highlight",
    reactions: { cache: createReactionCache(5) },
  });
  const attachmentOnlyUpdate = buildMessage({
    id: highlightedMessage.id,
    content: "",
    author: highlightedMessage.author,
    channel: highlightedMessage.channel,
    reactions: { cache: createReactionCache(0) },
  });

  await runtime.processMessage(highlightedMessage, "messageCreate");
  const result = await runtime.processUpdate(
    highlightedMessage,
    attachmentOnlyUpdate,
  );

  assert.equal(result.lostHighlight, true);
  assert.equal(archivist.getHighlightCount(), 0);
  assert.equal(archivist.getUserPoints(highlightedMessage.author.id).points, 0);

  archivist.close();
  env.cleanup();
});

test("hydrates partial reactions and removes deleted messages through runtime handlers", async () => {
  const env = withArchivistEnvironment();
  const archivist = new ServerArchivist();
  await grantConsent(archivist);
  const runtime = createRuntime({
    archivist,
    logger: { info() {}, warn() {}, error() {} },
  });
  const message = buildMessage({
    id: "partial-message",
    content: "wow partial flow",
    reactions: { cache: createReactionCache(4) },
  });

  const partialReaction = {
    partial: true,
    message,
    async fetch() {
      return { ...this, partial: false, message };
    },
  };

  await runtime.processReaction(
    partialReaction,
    createUser({ id: "user-2" }),
    "reaction add",
  );
  const removal = await runtime.processDeletion(message, "message deletion");

  assert.equal(removal.removed, true);
  assert.equal(
    archivist.db
      .prepare(
        "SELECT * FROM highlights_anonymized WHERE hashed_message_id = ?",
      )
      .all(archivist.hashUserId(message.id)).length,
    0,
  );

  archivist.close();
  env.cleanup();
});

test("sends weekly recaps only once per ISO week when enabled", async () => {
  const env = withArchivistEnvironment();
  const archivist = new ServerArchivist();
  archivist.setWeeklyRecapConfig({
    enabled: true,
    channelId: "weekly-channel",
  });

  const mondayMorning = new Date("2026-03-30T09:30:00");
  assert.equal(archivist.shouldSendWeeklyRecap(mondayMorning), true);

  archivist.markWeeklyRecapSent(mondayMorning);
  assert.equal(archivist.shouldSendWeeklyRecap(mondayMorning), false);

  archivist.close();
  env.cleanup();
});

test("passes the visible channel into weekly report queries", async () => {
  let receivedArguments;
  const interaction = {
    channelId: "visible-weekly-channel",
    client: {
      archivist: {
        generateWeeklyReport(...args) {
          receivedArguments = args;
          return {
            startDate: new Date("2026-03-23T00:00:00Z"),
            endDate: new Date("2026-03-30T00:00:00Z"),
            highlights: [],
            totalHighlights: 0,
          };
        },
      },
    },
    async reply() {},
  };

  await weeklyCommand.execute(interaction);

  assert.equal(receivedArguments[1], "visible-weekly-channel");
});

test("passes scheduled destination channels into recap and daily queries", async () => {
  const env = withArchivistEnvironment();
  const archivist = new ServerArchivist();
  const deliveryChannelId = "scheduled-delivery-channel";
  archivist.setWeeklyRecapConfig({
    enabled: true,
    channelId: deliveryChannelId,
  });
  archivist.setMomentOfDayConfig({
    enabled: true,
    channelId: deliveryChannelId,
    postHourUtc: 12,
  });
  let weeklyArguments;
  let momentArguments;
  archivist.generateWeeklyReport = (...args) => {
    weeklyArguments = args;
    return {
      startDate: new Date("2026-03-23T00:00:00Z"),
      endDate: new Date("2026-03-30T00:00:00Z"),
      highlights: [],
      totalHighlights: 0,
    };
  };
  archivist.getMomentOfDayCandidate = (...args) => {
    momentArguments = args;
    return null;
  };
  const client = {
    channels: {
      async fetch(channelId) {
        return {
          id: channelId,
          guildId: "guild-1",
          isTextBased: () => true,
          async send() {},
        };
      },
    },
  };
  const runtime = createRuntime({
    archivist,
    allowedGuildId: "guild-1",
    logger: { info() {}, warn() {}, error() {} },
  });

  await runtime.dispatchWeeklyRecap(client, "test-weekly", { force: true });
  await runtime.dispatchMomentOfDay(client, "test-moment", { force: true });

  assert.equal(weeklyArguments[1], deliveryChannelId);
  assert.equal(momentArguments[1], deliveryChannelId);

  archivist.close();
  env.cleanup();
});

test("selects the highest-scoring Moment of the Day candidate and avoids reposting it", async () => {
  const env = withArchivistEnvironment();
  const archivist = new ServerArchivist();

  const lowerMoment = buildMessage({
    id: "motd-low",
    content: "wow decent moment",
    reactions: { cache: createReactionCache(3) },
  });
  const higherMoment = buildMessage({
    id: "motd-high",
    content: "wow unforgettable community moment",
    reactions: { cache: createReactionCache(8) },
  });

  await archivist.recordMessage(lowerMoment, { bypassConsent: true });
  await archivist.recordMessage(higherMoment, { bypassConsent: true });

  const firstCandidate = archivist.getMomentOfDayCandidate(
    new Date("2026-03-31T12:00:00Z"),
    lowerMoment.channel.id,
  );
  assert.equal(
    firstCandidate.hashed_message_id,
    archivist.hashUserId("motd-high"),
  );

  archivist.markMomentOfDaySent(
    firstCandidate.hashed_message_id,
    new Date("2026-03-31T12:00:00Z"),
  );

  const secondCandidate = archivist.getMomentOfDayCandidate(
    new Date("2026-03-31T12:00:00Z"),
    lowerMoment.channel.id,
  );
  assert.equal(
    secondCandidate.hashed_message_id,
    archivist.hashUserId("motd-low"),
  );

  archivist.close();
  env.cleanup();
});

test("scopes stored highlight disclosures to their source channel", async () => {
  const env = withArchivistEnvironment();
  const archivist = new ServerArchivist();
  const privateMessage = buildMessage({
    id: "private-channel-highlight",
    content: "wow private channel highlight",
    channel: createChannel({ id: "private-channel" }),
    reactions: { cache: createReactionCache(5) },
  });
  const publicMessage = buildMessage({
    id: "public-channel-highlight",
    content: "wow public channel highlight",
    channel: createChannel({ id: "public-channel" }),
    reactions: { cache: createReactionCache(4) },
  });

  await archivist.recordMessage(privateMessage, { bypassConsent: true });
  await archivist.recordMessage(publicMessage, { bypassConsent: true });
  archivist.db
    .prepare(
      "UPDATE highlights_anonymized SET highlight_score = ? WHERE hashed_message_id = ?",
    )
    .run(0.9, archivist.hashUserId(privateMessage.id));
  archivist.db
    .prepare(
      "UPDATE highlights_anonymized SET highlight_score = ? WHERE hashed_message_id = ?",
    )
    .run(0.7, archivist.hashUserId(publicMessage.id));

  const weekly = archivist.generateWeeklyReport(5, "public-channel");
  const monthly = archivist.generateMonthlyReport("public-channel");
  const unscoped = archivist.generateWeeklyReport();
  const candidate = archivist.getMomentOfDayCandidate(
    new Date(),
    "public-channel",
  );

  assert.deepEqual(
    weekly.highlights.map((row) => row.hashed_message_id),
    [archivist.hashUserId(publicMessage.id)],
  );
  assert.deepEqual(
    monthly.highlights.map((row) => row.hashed_message_id),
    [archivist.hashUserId(publicMessage.id)],
  );
  assert.equal(unscoped.totalHighlights, 0);
  assert.equal(
    candidate.hashed_message_id,
    archivist.hashUserId(publicMessage.id),
  );

  archivist.close();
  env.cleanup();
});

test("sends Moment of the Day only once per UTC day after the configured hour", async () => {
  const env = withArchivistEnvironment();
  const archivist = new ServerArchivist();

  const beforeHour = new Date("2026-03-31T11:00:00Z");
  const afterHour = new Date("2026-03-31T12:05:00Z");

  assert.equal(archivist.shouldSendMomentOfDay(beforeHour), false);
  assert.equal(archivist.shouldSendMomentOfDay(afterHour), true);

  archivist.markMomentOfDaySent("hashed-message", afterHour);
  assert.equal(archivist.shouldSendMomentOfDay(afterHour), false);

  archivist.close();
  env.cleanup();
});

test("registers Discord event handlers on an EventEmitter-compatible client", async () => {
  const env = withArchivistEnvironment();
  const archivist = new ServerArchivist();
  await grantConsent(archivist);
  const client = new EventEmitter();
  const runtime = createRuntime({
    archivist,
    logger: { info() {}, warn() {}, error() {} },
  });

  runtime.registerEventHandlers(client);

  const message = buildMessage({
    id: "emitter-message",
    content: "wow emitter highlight",
    reactions: { cache: createReactionCache(6) },
  });

  client.emit("messageCreate", message);
  await new Promise((resolve) => setImmediate(resolve));

  const points = archivist.getUserPoints(message.author.id);
  assert.equal(points.points, 10);

  archivist.close();
  env.cleanup();
});

test("rejects messages from a different Discord server before analysis or storage", async () => {
  const env = withArchivistEnvironment();
  const archivist = new ServerArchivist();
  const runtime = createRuntime({
    archivist,
    allowedGuildId: "guild-1",
    logger: { info() {}, warn() {}, error() {} },
  });
  const foreignMessage = buildMessage({
    id: "foreign-message",
    guild: createGuild({ id: "guild-2" }),
    content: "wow this must never cross the guild boundary",
    reactions: { cache: createReactionCache(10) },
  });

  const directResult = await archivist.recordMessage(foreignMessage, {
    bypassConsent: true,
  });
  const runtimeResult = await runtime.processMessage(
    foreignMessage,
    "foreign-guild-probe",
  );

  assert.equal(directResult.reason, "guild-not-allowed");
  assert.equal(runtimeResult.reason, "guild-not-allowed");
  assert.equal(archivist.getHighlightCount(), 0);

  archivist.close();
  env.cleanup();
});

test("rejects known foreign partials before requesting Discord hydration", async () => {
  const env = withArchivistEnvironment();
  const archivist = new ServerArchivist();
  const runtime = createRuntime({
    archivist,
    logger: { info() {}, warn() {}, error() {} },
  });
  let messageFetches = 0;
  let reactionFetches = 0;
  const foreignPartialMessage = buildMessage({
    id: "foreign-partial-message",
    guild: createGuild({ id: "guild-2" }),
    partial: true,
    async fetch() {
      messageFetches += 1;
      return this;
    },
  });
  const foreignPartialReaction = {
    partial: true,
    message: foreignPartialMessage,
    async fetch() {
      reactionFetches += 1;
      return this;
    },
  };

  const messageResult = await runtime.processMessage(
    foreignPartialMessage,
    "foreign-partial-message",
  );
  const reactionResult = await runtime.processReaction(
    foreignPartialReaction,
    createUser(),
    "foreign-partial-reaction",
  );

  assert.equal(messageResult.reason, "guild-not-allowed");
  assert.equal(reactionResult.reason, "guild-not-allowed");
  assert.equal(messageFetches, 0);
  assert.equal(reactionFetches, 0);

  archivist.close();
  env.cleanup();
});

test("rejects a runtime guild scope that differs from database ownership", () => {
  const env = withArchivistEnvironment();
  const archivist = new ServerArchivist();

  assert.throws(
    () =>
      createRuntime({
        archivist,
        allowedGuildId: "guild-2",
        logger: { info() {}, warn() {}, error() {} },
      }),
    /must match the database-bound Archivist guild/,
  );

  archivist.close();
  env.cleanup();
});

test("binds a database to one Discord server and rejects later reassignment", () => {
  const env = withArchivistEnvironment();
  const archivist = new ServerArchivist();
  archivist.close();

  assert.throws(
    () => new ServerArchivist({ allowedGuildId: "guild-2" }),
    /database belongs to Discord server guild-1/,
  );

  env.cleanup();
});

test("requires explicit ownership attestation for a non-empty legacy database", () => {
  const env = withArchivistEnvironment();
  const database = new Database(process.env.DATABASE_PATH);
  database.exec(`
    CREATE TABLE highlights_anonymized (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hashed_author_id TEXT NOT NULL,
      hashed_message_id TEXT,
      channel_type TEXT NOT NULL,
      anonymized_content TEXT NOT NULL,
      sentiment_score REAL NOT NULL,
      reaction_count INTEGER NOT NULL,
      is_highlight BOOLEAN NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO highlights_anonymized (
      hashed_author_id,
      hashed_message_id,
      channel_type,
      anonymized_content,
      sentiment_score,
      reaction_count,
      is_highlight
    ) VALUES ('legacy-author', 'legacy-message', 'GuildText', 'legacy', 1, 3, 1);
  `);
  database.close();

  assert.throws(() => new ServerArchivist(), /LEGACY_GUILD_ID/);

  process.env.LEGACY_GUILD_ID = "guild-1";
  const archivist = new ServerArchivist();
  assert.equal(
    archivist.db
      .prepare(
        "SELECT value FROM instance_metadata WHERE key = 'allowed_guild_id'",
      )
      .get().value,
    "guild-1",
  );

  archivist.close();
  env.cleanup();
});

test("migrates a legacy highlight table before creating dependent indexes", () => {
  const env = withArchivistEnvironment();
  const database = new Database(process.env.DATABASE_PATH);
  database.exec(`
    CREATE TABLE highlights_anonymized (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hashed_author_id TEXT NOT NULL,
      channel_type TEXT NOT NULL,
      anonymized_content TEXT NOT NULL,
      sentiment_score REAL NOT NULL,
      reaction_count INTEGER NOT NULL,
      is_highlight BOOLEAN NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  database.close();

  const archivist = new ServerArchivist();
  const columns = archivist.db
    .prepare("PRAGMA table_info(highlights_anonymized)")
    .all()
    .map((column) => column.name);

  assert.equal(columns.includes("hashed_message_id"), true);
  assert.equal(columns.includes("highlight_score"), true);
  assert.equal(columns.includes("keyword_count"), true);
  assert.equal(columns.includes("reply_count"), true);
  assert.equal(columns.includes("hashed_source_channel_id"), true);
  assert.equal(
    archivist.db
      .prepare(
        "SELECT COUNT(*) AS count FROM schema_migrations WHERE version = 2",
      )
      .get().count,
    1,
  );
  assert.equal(
    archivist.db
      .prepare(
        "SELECT COUNT(*) AS count FROM schema_migrations WHERE version = 3",
      )
      .get().count,
    1,
  );

  archivist.close();
  env.cleanup();
});

test("migration removes legacy non-highlights and quarantines unknown source channels", () => {
  const env = withArchivistEnvironment();
  const database = new Database(process.env.DATABASE_PATH);
  database.exec(`
    CREATE TABLE highlights_anonymized (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hashed_author_id TEXT NOT NULL,
      hashed_message_id TEXT,
      channel_type TEXT NOT NULL,
      anonymized_content TEXT NOT NULL,
      sentiment_score REAL NOT NULL,
      reaction_count INTEGER NOT NULL,
      is_highlight BOOLEAN NOT NULL,
      highlight_score REAL NOT NULL DEFAULT 0,
      keyword_count INTEGER NOT NULL DEFAULT 0,
      reply_count INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO highlights_anonymized (
      hashed_author_id,
      hashed_message_id,
      channel_type,
      anonymized_content,
      sentiment_score,
      reaction_count,
      is_highlight,
      highlight_score
    ) VALUES
      ('legacy-author', 'legacy-low', 'GuildText', 'ordinary legacy row', 0, 0, 0, 0),
      ('legacy-author', 'legacy-high', 'GuildText', 'legacy highlight', 1, 3, 1, 0.8);
  `);
  database.close();
  process.env.LEGACY_GUILD_ID = "guild-1";

  const archivist = new ServerArchivist();
  const rows = archivist.db
    .prepare(
      "SELECT hashed_message_id, hashed_source_channel_id FROM highlights_anonymized ORDER BY hashed_message_id",
    )
    .all();

  assert.deepEqual(rows, [
    { hashed_message_id: "legacy-high", hashed_source_channel_id: null },
  ]);
  assert.equal(
    archivist.generateWeeklyReport(5, "channel-1").totalHighlights,
    0,
  );

  archivist.close();
  env.cleanup();
});

test("runs the legacy score backfill only once", () => {
  const env = withArchivistEnvironment();
  process.env.MIN_SCORE = "0";
  const archivist = new ServerArchivist();
  archivist.db
    .prepare(
      `
      INSERT INTO highlights_anonymized (
        hashed_author_id,
        hashed_message_id,
        hashed_source_channel_id,
        channel_type,
        anonymized_content,
        sentiment_score,
        reaction_count,
        is_highlight,
        highlight_score,
        keyword_count,
        reply_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    )
    .run(
      "zero-score-author",
      "zero-score-message",
      "channel-1",
      "GuildText",
      "legitimate zero score",
      0,
      0,
      1,
      0,
      0,
      0,
    );
  archivist.close();

  process.env.MIN_SCORE = "0.6";
  const reopenedArchivist = new ServerArchivist();
  const stored = reopenedArchivist.db
    .prepare(
      "SELECT highlight_score FROM highlights_anonymized WHERE hashed_message_id = ?",
    )
    .get("zero-score-message");

  assert.equal(stored.highlight_score, 0);

  reopenedArchivist.close();
  env.cleanup();
});

test("preserves zero-valued score, post-hour, and empty-keyword configuration", () => {
  const env = withArchivistEnvironment();
  process.env.MIN_SCORE = "0";
  process.env.MOTD_POST_HOUR = "0";
  process.env.KEYWORDS = "";

  const archivist = new ServerArchivist();

  assert.equal(archivist.highlightThresholds.minScore, 0);
  assert.equal(archivist.getMomentOfDayConfig().postHourUtc, 0);
  assert.deepEqual(archivist.highlightThresholds.keywords, []);

  archivist.close();
  env.cleanup();
});

test("retention cleanup removes expired highlight points in the same transaction", async () => {
  const env = withArchivistEnvironment();
  process.env.DATA_RETENTION_DAYS = "1";
  const archivist = new ServerArchivist();
  const message = buildMessage({
    id: "expired-highlight",
    author: createUser({ id: "expired-author" }),
    content: "wow an old highlight that should fully expire",
    reactions: { cache: createReactionCache(8) },
  });

  await archivist.recordMessage(message, { bypassConsent: true });
  archivist.db
    .prepare(
      "UPDATE highlights_anonymized SET created_at = '2000-01-01T00:00:00.000Z'",
    )
    .run();

  assert.equal(archivist.purgeExpiredHighlights(), 1);
  assert.equal(archivist.getHighlightCount(), 0);
  assert.equal(archivist.getUserPoints(message.author.id).points, 0);
  assert.equal(
    archivist.getUserPoints(message.author.id).highlights_created,
    0,
  );

  archivist.close();
  env.cleanup();
});

test("uses the persisted highlight score when selecting Moment of the Day", async () => {
  const env = withArchivistEnvironment();
  process.env.MIN_SCORE = "0.6";
  process.env.KEYWORDS = "wow,omg,epic";
  const archivist = new ServerArchivist();
  const message = buildMessage({
    id: "keyword-driven-moment",
    content:
      "wow omg epic this is a sufficiently long community message designed to reach the configured score threshold for this probe",
    reactions: { cache: createReactionCache(0) },
  });

  const analysis = await archivist.recordMessage(message, {
    bypassConsent: true,
  });
  const candidate = archivist.getMomentOfDayCandidate(
    undefined,
    message.channel.id,
  );

  assert.equal(analysis.isHighlight, true);
  assert.equal(analysis.highlightScore, 0.6);
  assert.equal(candidate.hashed_message_id, archivist.hashUserId(message.id));
  assert.equal(candidate.highlightScore, analysis.highlightScore);

  archivist.close();
  env.cleanup();
});

test("redacts structured identifiers without claiming free-form anonymity", () => {
  const env = withArchivistEnvironment();
  const archivist = new ServerArchivist();
  const result = archivist.redactContent(
    "Call +49 151 12345678, IP 192.168.1.42 <:club:123456789012345678> <t:1770000000:F>",
  );

  assert.equal(result.includes("12345678"), false);
  assert.equal(result.includes("192.168.1.42"), false);
  assert.equal(result.includes("123456789012345678"), false);
  assert.equal(result.includes("1770000000"), false);
  assert.equal(result.includes("[PHONE]"), true);
  assert.equal(result.includes("[IP]"), true);
  assert.equal(result.includes("[EMOJI]"), true);
  assert.equal(result.includes("[TIME]"), true);

  archivist.close();
  env.cleanup();
});

test("requires an explicit administrator confirmation before clearing data", async () => {
  const env = withArchivistEnvironment();
  const archivist = new ServerArchivist();
  await archivist.recordMessage(
    buildMessage({
      id: "clear-confirmation-highlight",
      reactions: { cache: createReactionCache(8) },
    }),
    { bypassConsent: true },
  );

  let initialReply;
  const client = {
    allowedGuildId: "guild-1",
    archivist,
  };
  const baseInteraction = {
    client,
    guildId: "guild-1",
    user: createUser({ id: "admin-user" }),
    memberPermissions: { has: () => true },
  };

  await archivistCommand.execute({
    ...baseInteraction,
    options: { getSubcommand: () => "clear" },
    async reply(payload) {
      initialReply = payload;
    },
  });

  assert.equal(archivist.getHighlightCount(), 1);
  assert.equal(initialReply.components.length, 1);
  const clearCustomId = initialReply.components[0].components[0].data.custom_id;

  let confirmationUpdate;
  await archivistCommand.handleComponent({
    ...baseInteraction,
    customId: clearCustomId,
    isButton: () => true,
    async update(payload) {
      confirmationUpdate = payload;
    },
  });

  assert.equal(archivist.getHighlightCount(), 0);
  assert.equal(confirmationUpdate.components.length, 0);
  assert.equal(
    archivist.db
      .prepare(
        "SELECT value FROM instance_metadata WHERE key = 'allowed_guild_id'",
      )
      .get().value,
    "guild-1",
  );

  let replayReply;
  await archivistCommand.handleComponent({
    ...baseInteraction,
    customId: clearCustomId,
    isButton: () => true,
    async reply(payload) {
      replayReply = payload;
    },
  });
  assert.match(replayReply.content, /invalid or expired/);

  archivist.close();
  env.cleanup();
});

test("complete backups include every dataset removed by complete deletion", async () => {
  const env = withArchivistEnvironment();
  const archivist = new ServerArchivist();
  await archivist.recordMessage(
    buildMessage({
      id: "complete-backup-highlight",
      reactions: { cache: createReactionCache(8) },
    }),
    { bypassConsent: true },
  );
  await archivist.setUserConsent("backup-user", true);
  archivist.setSetting("backup-probe", "present");
  archivist.setChannelRule("backup-channel", "include");

  const backup = archivist.createBackupPayload();

  assert.equal(backup.highlights.length, 1);
  assert.equal(backup.userPoints.length, 1);
  assert.equal(backup.privacyConsents.length, 1);
  assert.equal(backup.applicationSettings.length, 1);
  assert.equal(backup.channelSettings.length, 1);
  assert.equal(backup.settings.allowedGuildId, "guild-1");

  archivist.close();
  env.cleanup();
});

test("delivers backups from memory without a plaintext temporary file", async () => {
  const env = withArchivistEnvironment();
  const archivist = new ServerArchivist();
  await archivist.recordMessage(
    buildMessage({
      id: "in-memory-backup-highlight",
      reactions: { cache: createReactionCache(5) },
    }),
    { bypassConsent: true },
  );
  let directMessagePayload;
  let editReply;
  const user = createUser({
    id: "backup-admin",
    createDM: async () => ({
      async send(payload) {
        directMessagePayload = payload;
      },
    }),
  });

  await archivistCommand.execute({
    client: { allowedGuildId: "guild-1", archivist },
    guildId: "guild-1",
    user,
    memberPermissions: { has: () => true },
    options: { getSubcommand: () => "backup" },
    async deferReply() {},
    async editReply(payload) {
      editReply = payload;
    },
  });

  const attachment = directMessagePayload.files[0];
  assert.equal(Buffer.isBuffer(attachment.attachment), true);
  assert.match(attachment.name, /^archivist-backup-\d+\.json$/);
  assert.equal(
    JSON.parse(attachment.attachment.toString("utf8")).highlights.length,
    1,
  );
  assert.match(editReply, /Backup complete/);

  archivist.close();
  env.cleanup();
});

test("refuses automatic delivery to a channel owned by another server", async () => {
  const env = withArchivistEnvironment();
  const archivist = new ServerArchivist();
  await grantConsent(archivist);
  archivist.setAutoHighlightPosting({
    enabled: true,
    channelId: "foreign-target",
  });
  let sent = 0;
  const client = {
    channels: {
      async fetch() {
        return {
          guildId: "guild-2",
          isTextBased: () => true,
          async send() {
            sent += 1;
          },
        };
      },
    },
  };
  const runtime = createRuntime({
    archivist,
    allowedGuildId: "guild-1",
    logger: { info() {}, warn() {}, error() {} },
  });

  const result = await runtime.processMessage(
    buildMessage({
      id: "foreign-delivery-probe",
      reactions: { cache: createReactionCache(8) },
    }),
    "messageCreate",
    client,
  );

  assert.equal(result.becameHighlight, true);
  assert.equal(sent, 0);

  archivist.close();
  env.cleanup();
});

test("auto-posts highlights only inside their original channel", async () => {
  const env = withArchivistEnvironment();
  const archivist = new ServerArchivist();
  await grantConsent(archivist);
  let sent = 0;
  const client = {
    channels: {
      async fetch(channelId) {
        return {
          id: channelId,
          guildId: "guild-1",
          isTextBased: () => true,
          async send() {
            sent += 1;
          },
        };
      },
    },
  };
  const runtime = createRuntime({
    archivist,
    allowedGuildId: "guild-1",
    logger: { info() {}, warn() {}, error() {} },
  });
  const sourceChannel = createChannel({ id: "source-channel" });

  archivist.setAutoHighlightPosting({
    enabled: true,
    channelId: "different-same-guild-channel",
  });
  await runtime.processMessage(
    buildMessage({
      id: "cross-channel-auto-post",
      channel: sourceChannel,
      reactions: { cache: createReactionCache(5) },
    }),
    "messageCreate",
    client,
  );
  assert.equal(sent, 0);

  archivist.setAutoHighlightPosting({
    enabled: true,
    channelId: sourceChannel.id,
  });
  await runtime.processMessage(
    buildMessage({
      id: "same-channel-auto-post",
      channel: sourceChannel,
      reactions: { cache: createReactionCache(5) },
    }),
    "messageCreate",
    client,
  );
  assert.equal(sent, 1);

  archivist.close();
  env.cleanup();
});

test("rolls back complete data deletion if any table clear fails", async () => {
  const env = withArchivistEnvironment();
  const archivist = new ServerArchivist();
  await archivist.recordMessage(
    buildMessage({
      id: "rollback-clear-highlight",
      reactions: { cache: createReactionCache(8) },
    }),
    { bypassConsent: true },
  );
  archivist.setSetting("rollback-probe", "present");
  archivist.db.exec(`
    CREATE TRIGGER fail_app_settings_clear
    BEFORE DELETE ON app_settings
    BEGIN
      SELECT RAISE(ABORT, 'injected clear failure');
    END
  `);

  assert.throws(() => archivist.clearAllData(), /injected clear failure/);
  assert.equal(archivist.getHighlightCount(), 1);
  assert.equal(archivist.getSetting("rollback-probe"), "present");

  archivist.close();
  env.cleanup();
});
