/**
 * Run every Playwright Electron E2E script (local full audit).
 *
 * Usage: npm run build && node scripts/run-all-e2e.cjs
 *
 * Skips visual-only helpers (visual-downloads.cjs).
 * Real-host suites (crash-reattach, clone-copy-real) may take a long time.
 */
const { execSync } = require("node:child_process");
const path = require("node:path");
const { killStrayElectronApps } = require("./e2e-launch.cjs");

const projectRoot = path.resolve(__dirname, "..");

const tests = [
  { name: "e2e:smoke", cmd: "npm run e2e:smoke" },
  { name: "e2e:keyboard", cmd: "npm run e2e:keyboard" },
  { name: "e2e", cmd: "npm run e2e" },
  { name: "e2e:install-health", cmd: "npm run e2e:install-health" },
  { name: "e2e:host-port-probe", cmd: "npm run e2e:host-port-probe" },
  { name: "e2e:critical-job-recovery", cmd: "npm run e2e:critical-job-recovery" },
  { name: "e2e:downloads-pause-resume", cmd: "npm run e2e:downloads-pause-resume" },
  { name: "e2e:mods", cmd: "npm run e2e:mods" },
  { name: "e2e:launch-args", cmd: "npm run e2e:launch-args" },
  { name: "e2e:log-retention", cmd: "npm run e2e:log-retention" },
  { name: "e2e:quit-policy", cmd: "npm run e2e:quit-policy" },
  { name: "e2e:rcon", cmd: "npm run e2e:rcon" },
  { name: "e2e:clusters-membership", cmd: "npm run e2e:clusters-membership" },
  { name: "e2e:copy-configuration", cmd: "npm run e2e:copy-configuration" },
  { name: "e2e:clone-copy", cmd: "npm run e2e:clone-copy" },
  { name: "e2e:import-install", cmd: "npm run e2e:import-install" },
  { name: "e2e:move-install", cmd: "npm run e2e:move-install" },
  { name: "e2e:personas", cmd: "npm run e2e:personas" },
  { name: "e2e:crash-reattach", cmd: "npm run e2e:crash-reattach" },
  { name: "e2e:clone-copy-real", cmd: "npm run e2e:clone-copy-real" },
];

const passed = [];
const failed = [];

console.log("Cleaning stray E2E Electron processes before run…");
killStrayElectronApps();

for (const test of tests) {
  console.log("");
  console.log(`========== ${test.name} ==========`);
  const started = Date.now();
  try {
    execSync(test.cmd, {
      cwd: projectRoot,
      stdio: "inherit",
      env: process.env,
    });
    passed.push(test.name);
    console.log(`PASSED ${test.name} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  } catch {
    failed.push(test.name);
    console.error(`FAILED ${test.name}`);
  }
}

console.log("");
console.log("========== E2E SUMMARY ==========");
console.log(`Passed (${passed.length}): ${passed.join(", ")}`);
console.log("Cleaning stray E2E Electron processes after run…");
killStrayElectronApps();
if (failed.length > 0) {
  console.error(`Failed (${failed.length}): ${failed.join(", ")}`);
  process.exit(1);
}
console.log("ALL E2E PASSED");
