#!/usr/bin/env node
/**
 * Builds the normal production renderer and emits its opt-in chunk inventory.
 * Windows-friendly so the same command works locally and in CI.
 */
const { spawnSync } = require("node:child_process");

const result = spawnSync("electron-vite", ["build"], {
  stdio: "inherit",
  env: { ...process.env, YARK_BUNDLE_REPORT: "1" },
  shell: true,
});

process.exit(result.status ?? 1);
