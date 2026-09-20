/**
 * Seed an isolated six-profile fleet for packaged memory benchmarks (#527).
 *
 * Does not touch real AppData. Uses artifacts/mem-bench/fleet by default.
 *
 * Usage:
 *   node scripts/validation/seed-mem-bench-fleet.cjs
 *   node scripts/validation/seed-mem-bench-fleet.cjs F:\path\to\userData
 */
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { initProfileDatabase } = require("../e2e-init-profile-db.cjs");

const projectRoot = path.resolve(__dirname, "..", "..");
const defaultUserData = path.join(projectRoot, "artifacts", "mem-bench", "fleet");

const MAPS = ["TheIsland_WP", "ScorchedEarth_WP", "Aberration_WP", "Extinction_WP", "Ragnarok_WP", "TheCenter_WP"];

function seedReadyInstall(installDir) {
  const win64 = path.join(installDir, "ShooterGame", "Binaries", "Win64");
  const config = path.join(installDir, "ShooterGame", "Saved", "Config", "WindowsServer");
  fs.mkdirSync(win64, { recursive: true });
  fs.mkdirSync(config, { recursive: true });
  fs.writeFileSync(path.join(win64, "ArkAscendedServer.exe"), "fake-asa-binary\n");
  fs.writeFileSync(path.join(win64, "version.txt"), "mem-bench-1.0\n");
  const defaultsDir = path.join(projectRoot, "src", "shared", "defaults");
  for (const name of ["GameUserSettings.ini", "Game.ini"]) {
    const src = path.join(defaultsDir, name);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(config, name));
    }
  }
}

function upsertSetting(db, key, value, updatedAt) {
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(key, value, updatedAt);
}

function seedFleet(userData) {
  fs.mkdirSync(userData, { recursive: true });
  const dbPath = path.join(userData, "yark-server-manager.db");
  for (const suffix of ["", "-wal", "-shm"]) {
    const candidate = `${dbPath}${suffix}`;
    if (fs.existsSync(candidate)) fs.unlinkSync(candidate);
  }

  initProfileDatabase(dbPath);
  const db = new DatabaseSync(dbPath);
  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT INTO servers (
      id, name, map, install_dir, enabled, session_name,
      game_port, query_port, rcon_port,
      server_password, admin_password,
      cluster_id, cluster_dir, extra_args, mods,
      disabled_mods, mod_metadata_cache, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const serversRoot = path.join(userData, "servers");
  for (let i = 0; i < 6; i += 1) {
    const installDir = path.join(serversRoot, `server-${i + 1}`);
    seedReadyInstall(installDir);
    insert.run(
      `mem-bench-${i + 1}`,
      `Mem Bench ${i + 1}`,
      MAPS[i],
      installDir,
      1,
      `Session Mem Bench ${i + 1}`,
      18000 + i * 10,
      38000 + i * 10,
      39000 + i * 10,
      null,
      "admin1234",
      i < 2 ? "mem-bench-cluster" : null,
      i < 2 ? path.join(userData, "clusters", "mem-bench-cluster") : null,
      "[]",
      "[]",
      "[]",
      "{}",
      now,
      now,
    );
  }

  upsertSetting(db, "onboarding.v1", JSON.stringify({ status: "completed", completedAt: now }), now);
  db.close();

  return { dbPath, serversRoot, count: 6 };
}

function main() {
  const userData = path.resolve(process.argv[2] ?? defaultUserData);
  const result = seedFleet(userData);
  const exe = path.join(projectRoot, "dist", "win-unpacked", "YARK server manager.exe");
  console.log(`Seeded ${result.count} profiles at ${userData}`);
  console.log(`DB: ${result.dbPath}`);
  console.log("");
  console.log("Launch packaged app (isolated userData):");
  console.log(`  Start-Process "${exe}" -ArgumentList '--user-data-dir=${userData}'`);
}

main();
