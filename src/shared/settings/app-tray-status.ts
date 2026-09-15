/**
 * Pure tray status copy (no Electron import) — shared by main tray and unit tests.
 */

export function formatTrayServerStatus(runningCount: number): string {
  if (runningCount <= 0) {
    return "No servers running";
  }
  if (runningCount === 1) {
    return "1 server running";
  }
  return `${runningCount} servers running`;
}
