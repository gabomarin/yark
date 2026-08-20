/**
 * Verify Electron fuses on a packaged Windows binary (#217).
 *
 * Usage:
 *   node scripts/verify-electron-fuses.cjs [path-to-exe-or-win-unpacked-dir]
 *
 * Defaults to dist/win-unpacked when no path is given.
 *
 * `@electron/fuses` is a **direct** devDependency. `require.resolve` of
 * `@electron/fuses/dist/bin.js` does not see electron-builder's nested copy,
 * so a missing root install used to fail with MODULE_NOT_FOUND.
 */
"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

/** @type {Record<string, boolean>} */
const EXPECTED = {
  RunAsNode: false,
  EnableCookieEncryption: true,
  EnableNodeOptionsEnvironmentVariable: false,
  EnableNodeCliInspectArguments: false,
  EnableEmbeddedAsarIntegrityValidation: true,
  OnlyLoadAppFromAsar: true,
  LoadBrowserProcessSpecificV8Snapshot: false,
  GrantFileProtocolExtraPrivileges: true,
};

/**
 * @param {string} target
 * @returns {string}
 */
function resolveElectronBinary(target) {
  const resolved = path.resolve(target);
  const st = fs.statSync(resolved);
  if (st.isFile()) {
    if (!resolved.toLowerCase().endsWith(".exe")) {
      throw new Error(`Expected an .exe, got: ${resolved}`);
    }
    return resolved;
  }
  if (!st.isDirectory()) {
    throw new Error(`Not a file or directory: ${resolved}`);
  }

  const entries = fs
    .readdirSync(resolved)
    .filter((name) => name.toLowerCase().endsWith(".exe"))
    .filter((name) => !/uninstall/i.test(name));
  if (entries.length === 0) {
    throw new Error(`No Electron .exe found under ${resolved}`);
  }

  const preferred = entries.find((name) => /yark/i.test(name));
  return path.join(resolved, preferred ?? entries[0]);
}

/**
 * @param {string} output
 * @returns {Map<string, boolean>}
 */
function parseFuseReadOutput(output) {
  /** @type {Map<string, boolean>} */
  const found = new Map();
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^\s*(\w+)\s+is\s+(Enabled|Disabled)\s*$/i);
    if (!match) {
      continue;
    }
    found.set(match[1], match[2].toLowerCase() === "enabled");
  }
  return found;
}

function main() {
  const targetArg = process.argv[2]?.trim();
  const target = targetArg && targetArg.length > 0 ? targetArg : path.join("dist", "win-unpacked");
  if (!fs.existsSync(target)) {
    console.error(`verify-electron-fuses: missing path ${path.resolve(target)}`);
    console.error("Run npm run package first, or pass an explicit .exe / win-unpacked path.");
    process.exit(1);
  }

  const electronBinary = resolveElectronBinary(target);
  console.log(`verify-electron-fuses: reading ${electronBinary}`);

  const result = spawnSync(
    process.execPath,
    [require.resolve("@electron/fuses/dist/bin.js"), "read", "--app", electronBinary],
    { encoding: "utf8" },
  );
  const combined = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (result.status !== 0) {
    console.error(combined.trim() || `fuse read failed with exit ${result.status}`);
    process.exit(result.status ?? 1);
  }

  console.log(combined.trimEnd());
  const found = parseFuseReadOutput(combined);
  /** @type {string[]} */
  const failures = [];

  for (const [name, expected] of Object.entries(EXPECTED)) {
    if (!found.has(name)) {
      failures.push(`missing fuse report for ${name}`);
      continue;
    }
    const actual = found.get(name);
    if (actual !== expected) {
      failures.push(
        `${name}: expected ${expected ? "Enabled" : "Disabled"}, got ${actual ? "Enabled" : "Disabled"}`,
      );
    }
  }

  if (failures.length > 0) {
    console.error("verify-electron-fuses: FAILED");
    for (const failure of failures) {
      console.error(`  - ${failure}`);
    }
    process.exit(1);
  }

  console.log("verify-electron-fuses: OK (matches package.json build.electronFuses)");
}

main();
