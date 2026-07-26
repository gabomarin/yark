/**
 * Clear + seed diagnostic logs for the first (or named) server profile.
 * Usage: node scripts/seed-server-logs.cjs [serverName]
 *
 * Resolves the same Electron userData directory the app uses:
 * - Windows: %APPDATA%/yark-server-manager
 * - macOS: ~/Library/Application Support/yark-server-manager
 * - Linux: ~/.config/yark-server-manager
 * Override with YARK_USER_DATA if needed.
 */
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { DatabaseSync } = require("node:sqlite");

const APP_DIR_NAME = "yark-server-manager";

function resolveUserDataDir() {
  const override = process.env.YARK_USER_DATA?.trim();
  if (override) return path.resolve(override);

  if (process.env.APPDATA) {
    return path.join(process.env.APPDATA, APP_DIR_NAME);
  }

  const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
  if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support", APP_DIR_NAME);
  }
  // Electron default on Linux and other non-Windows platforms.
  return path.join(home, ".config", APP_DIR_NAME);
}

const userData = resolveUserDataDir();
const dbPath = path.join(userData, "yark-server-manager.db");
const updateLogsDir = path.join(userData, "update-logs");
const wantedName = process.argv[2] ?? null;

if (!fs.existsSync(dbPath)) {
  console.error("DB not found:", dbPath);
  console.error(
    "Tip: set YARK_USER_DATA to the Electron userData folder if the app uses a custom path.",
  );
  process.exit(1);
}

fs.mkdirSync(updateLogsDir, { recursive: true });

const db = new DatabaseSync(dbPath);
const servers = db.prepare("SELECT id, name, install_dir FROM servers ORDER BY name").all();
if (servers.length === 0) {
  console.error("No servers in DB");
  process.exit(1);
}

const server =
  wantedName !== null
    ? servers.find((s) => s.name.toLowerCase() === wantedName.toLowerCase())
    : servers[0];
if (server === undefined) {
  console.error("Server not found:", wantedName);
  process.exit(1);
}

const serverId = server.id;
console.log(`Target server: ${server.name} (${serverId})`);

// --- clear ---
const deletedEvents = db.prepare("DELETE FROM events WHERE server_id = ?").run(serverId);
console.log(`Cleared events: ${deletedEvents.changes}`);

const existingLogs = fs
  .readdirSync(updateLogsDir)
  .filter((name) => name.startsWith(`${serverId}-`));
for (const name of existingLogs) {
  fs.unlinkSync(path.join(updateLogsDir, name));
}
console.log(`Cleared update log files: ${existingLogs.length}`);

function insertEvent(type, severity, message, details, minutesAgo) {
  const createdAt = new Date(Date.now() - minutesAgo * 60_000).toISOString();
  db.prepare(
    `INSERT INTO events (server_id, type, severity, message, created_at, details)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    serverId,
    type,
    severity,
    message,
    createdAt,
    details === null ? null : JSON.stringify(details),
  );
}

const installDir = server.install_dir;
const backupRoot = path.join(installDir, "Backups");

// --- seed events (newest first by minutesAgo ascending = more recent) ---
insertEvent(
  "server_created",
  "info",
  `Server \"${server.name}\" created`,
  {
    what: "A new dedicated server profile was added to the manager.",
    location: installDir,
    suggestion: "Install base files via SteamCMD before the first start.",
    context: { installDir },
  },
  240,
);

insertEvent(
  "update_started",
  "info",
  `Installing base files via SteamCMD on \"${server.name}\"`,
  {
    what: "SteamCMD install-files job started.",
    location: installDir,
    suggestion: "Keep the server stopped until the job finishes.",
    context: { operation: "install-files" },
  },
  220,
);

insertEvent(
  "update_completed",
  "info",
  `Base files installed for \"${server.name}\"`,
  {
    what: "SteamCMD finished installing ASA dedicated server files.",
    location: installDir,
    context: { operation: "install-files", exitCode: 0 },
  },
  200,
);

insertEvent(
  "server_started",
  "info",
  `Server \"${server.name}\" started`,
  {
    what: "The dedicated server process was launched by the manager.",
    location: installDir,
  },
  180,
);

insertEvent(
  "rcon_command",
  "info",
  `RCON on ${server.name}: ListPlayers`,
  {
    what: "An RCON command was sent to the running server.",
    context: { command: "ListPlayers" },
  },
  170,
);

insertEvent(
  "backup_created",
  "info",
  `Backup manual/world completed for \"${server.name}\" (12.4 MB)`,
  {
    what: "A manual world backup finished successfully.",
    location: path.join(backupRoot, "World"),
    context: { type: "manual", kind: "world", sizeBytes: 12_992_512 },
  },
  150,
);

insertEvent(
  "backup_created",
  "info",
  `Backup player_connect/players completed for \"${server.name}\" (840 KB)`,
  {
    what: "A per-player profile archive was created on connect.",
    location: path.join(backupRoot, "Player profiles"),
    context: { type: "player_connect", kind: "players" },
  },
  140,
);

insertEvent(
  "error",
  "error",
  `Backup scheduled/world failed for \"${server.name}\": ENOSPC: no space left on device`,
  {
    what: "A scheduled world backup failed before the archive was completed.",
    cause: "ENOSPC: no space left on device",
    location: path.join(backupRoot, "World", "scheduled-world.zip"),
    suggestion:
      "Free disk space on the backup volume, run Cleanup from the Backups page, then retry.",
    context: { type: "scheduled", kind: "world", code: "ENOSPC" },
  },
  120,
);

insertEvent(
  "update_started",
  "info",
  `Starting safe update for \"${server.name}\"`,
  {
    what: "Safe update job queued (stop if needed → pre-update backup → SteamCMD → restart if it was running).",
    location: installDir,
    suggestion:
      "The manager stops a running server before the pre-update backup and SteamCMD, then restarts it after a successful update.",
    context: { operation: "update" },
  },
  90,
);

insertEvent(
  "update_failed",
  "error",
  `Update failed on \"${server.name}\": SteamCMD exited with code 8`,
  {
    what: "Safe update failed after the pre-update backup step.",
    cause: "SteamCMD exited with code 8",
    location: installDir,
    suggestion:
      "Open the Updates tab for the SteamCMD log. Confirm disk space is OK, then retry.",
    context: { operation: "update", exitCode: 8 },
  },
  85,
);

insertEvent(
  "update_rolled_back",
  "warning",
  "Update automatically rolled back using backups bk-world-1, bk-players-1, bk-ini-1",
  {
    what: "The failed update was rolled back using pre-update backups.",
    cause: "Update failed; manager restored the pre-update archives and restarted the server.",
    suggestion:
      "Confirm world/players look correct, inspect the update log, then retry the update when ready.",
    context: { backupIds: "bk-world-1, bk-players-1, bk-ini-1" },
  },
  80,
);

insertEvent(
  "server_crashed",
  "error",
  `Server \"${server.name}\" exited unexpectedly (exit code 1)`,
  {
    what: "The dedicated server process exited unexpectedly.",
    cause: "Crash, kill, or OS-level termination while the manager expected it to stay running.",
    location: installDir,
    suggestion: "Check Runtime for ASA/engine lines, then recent Updates and mods.",
    context: { exitCode: 1 },
  },
  45,
);

insertEvent(
  "server_started",
  "info",
  `Server \"${server.name}\" started`,
  {
    what: "The dedicated server process was launched by the manager.",
    location: installDir,
  },
  30,
);

insertEvent(
  "backup_restored",
  "info",
  `Restore applied on \"${server.name}\" from world backup bk-world-1`,
  {
    what: "Server files were restored from a backup archive.",
    location: path.join(backupRoot, "World"),
    suggestion: "Confirm the restored kind before starting the server.",
    context: { kind: "world", backupId: "bk-world-1" },
  },
  20,
);

insertEvent(
  "backup_deleted",
  "info",
  "Old world backup removed by retention: world-2026-07-01.zip",
  {
    what: "A backup archive was removed by retain-last policy.",
    location: path.join(backupRoot, "World", "world-2026-07-01.zip"),
    context: { kind: "world", reason: "retention" },
  },
  10,
);

insertEvent(
  "error",
  "warning",
  `Job restore will retry (2/3)`,
  {
    what: "A critical backup job hit a transient failure and will retry.",
    cause: "Temporary lock or I/O delay while restoring.",
    suggestion: "Wait for retries to finish; check Events again if it exhausts attempts.",
    context: { job: "restore", attempts: 2, maxAttempts: 3 },
  },
  5,
);

const eventCount = db
  .prepare("SELECT COUNT(*) AS c FROM events WHERE server_id = ?")
  .get(serverId).c;
console.log(`Seeded events: ${eventCount}`);

// --- seed update log files ---
function writeUpdateLog(suffix, status, exitCode, body) {
  const stamp = suffix;
  const fileName = `${serverId}-${stamp}.log`;
  const fullPath = path.join(updateLogsDir, fileName);
  const started = new Date(Date.now() - 90 * 60_000).toISOString();
  const content = [
    `time=${started}`,
    `exitCode=${exitCode}`,
    `durationMs=${status === "success" ? 42000 : 18500}`,
    "--- stdout ---",
    body,
    "",
  ].join("\n");
  fs.writeFileSync(fullPath, content, "utf8");
  // bump mtime variety
  const ageMs = status === "success" ? 200 * 60_000 : 85 * 60_000;
  const when = new Date(Date.now() - ageMs);
  fs.utimesSync(fullPath, when, when);
  return fileName;
}

const successLog = writeUpdateLog(
  "2026-07-25T18-00-00",
  "success",
  0,
  [
    "[SteamCMD] Loading Steam API...",
    `Redirecting stderr to '${installDir}\\logs\\stderr.txt'`,
    "[  0%] Checking for available updates...",
    "[----] Downloading update (0 of 0 KB)...",
    "[----] Installing update...",
    "[----] Extracting package...",
    "Success! App '2430930' fully installed.",
    "Unloading Steam API...",
  ].join("\n"),
);

const failedLog = writeUpdateLog(
  "2026-07-25T20-10-00",
  "failed",
  8,
  [
    "[SteamCMD] Loading Steam API...",
    "ERROR! Failed to install app '2430930' (No disk space / network error).",
    "CWorkThreadPool::~CWorkThreadPool: exiting thread.",
    "Exit code 8",
  ].join("\n"),
);

const verifyLog = writeUpdateLog(
  "2026-07-25T16-30-00",
  "success",
  0,
  [
    "[SteamCMD] validate enabled",
    "Update state (0x61) downloading, progress: 100.00",
    "Success! App '2430930' fully installed / validated.",
  ].join("\n"),
);

console.log("Seeded update logs:", successLog, failedLog, verifyLog);

// Note: runtime logs are in-memory only while the process runs.
console.log(
  "NOTE: Runtime tab needs a live/recent process capture; Events/Updates/Backups are seeded.",
);

db.close();
console.log("DONE");
