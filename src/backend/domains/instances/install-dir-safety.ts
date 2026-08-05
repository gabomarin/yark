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
