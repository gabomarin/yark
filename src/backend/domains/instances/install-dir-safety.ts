import { existsSync, readdirSync, statSync } from "node:fs";
import { parse as parsePath, resolve } from "node:path";

/** Windows install-directory comparison key (paths are case-insensitive). */
export function installDirKey(installDir: string): string {
  return resolve(installDir).toLowerCase();
}

/** True for `H:\`, `H:`, or a path that resolves to a volume root. */
export function isWindowsDriveRoot(pathValue: string): boolean {
  const resolved = resolve(pathValue);
  const root = parsePath(resolved).root;
  if (resolved.length === 0 || resolved === root) {
    return true;
  }
  return /^[a-zA-Z]:\\?$/.test(resolved);
}

/**
 * Rejects drive roots and overly generic system folders before recursive wipe.
 * Returns the resolved absolute path when safe.
 */
export function assertSafeInstallDirForWipe(installDir: string): string {
  const resolved = resolve(installDir);
  if (isWindowsDriveRoot(resolved)) {
    throw new Error(
      `Install path is not safe to delete from disk: "${installDir}"`,
    );
  }
  // Avoid deleting roots like C:\Users or C:\Windows by accident.
  const normalized = resolved.replace(/[/\\]+$/, "").toLowerCase();
  const forbidden = [
    "c:\\windows",
    "c:\\users",
    "c:\\program files",
    "c:\\program files (x86)",
  ];
  if (forbidden.some((item) => normalized === item)) {
    throw new Error(
      `Install path is too generic to delete from disk: "${resolved}"`,
    );
  }
  return resolved;
}

/**
 * Create/clone may only target a missing folder or an empty directory.
 * Non-empty trees (including ASA installs) must use Import instead.
 */
export function assertInstallDirVacantForCreate(installDir: string): void {
  if (!existsSync(installDir)) {
    return;
  }
  let stat;
  try {
    stat = statSync(installDir);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Cannot read install folder "${installDir}": ${detail}`);
  }
  if (!stat.isDirectory()) {
    throw new Error(`Install path is not a folder: "${installDir}"`);
  }
  let entries: string[];
  try {
    entries = readdirSync(installDir);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Cannot read install folder "${installDir}": ${detail}`);
  }
  if (entries.length > 0) {
    throw new Error(
      `Install folder is not empty: "${installDir}". Pick an empty folder, or use Import install for an existing ASA server.`,
    );
  }
}
