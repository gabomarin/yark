/**
 * Kill leftover Electron/YARK windows from local E2E runs.
 *
 * Usage: node scripts/e2e-kill-leftover.cjs
 *        npm run e2e:kill-leftover
 */
const { killStrayElectronApps } = require("./e2e-launch.cjs");

const killed = killStrayElectronApps();
if (killed.length === 0) {
  console.log("E2E_KILL_LEFTOVER none found");
} else {
  console.log(`E2E_KILL_LEFTOVER done (${killed.length})`);
}
