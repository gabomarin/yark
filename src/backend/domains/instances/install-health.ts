import { existsSync, readdirSync, statSync } from "node:fs";
import { access, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { InstallationHealthReasonCode } from "@shared/installation-health";
import type { InstallationHealthStatus } from "@shared/types";

const ASA_MARKER_NAMES = ["ShooterGame", "Engine", "steamapps"] as const;

function isAccessErrno(error: unknown): boolean {
  if (error == null || typeof error !== "object") {
    return false;
  }
  const code = (error as NodeJS.ErrnoException).code;
  return code === "EACCES" || code === "EPERM";
}

function isNotFoundErrno(error: unknown): boolean {
  if (error == null || typeof error !== "object") {
    return false;
  }
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

function hasAsaMarkers(installDir: string): boolean {
  for (const name of ASA_MARKER_NAMES) {
    if (existsSync(join(installDir, name))) {
      return true;
    }
  }
  return false;
}

async function hasAsaMarkersAsync(installDir: string): Promise<boolean> {
  for (const name of ASA_MARKER_NAMES) {
    try {
      await access(join(installDir, name));
      return true;
    } catch {
      // try next marker
    }
  }
  return false;
}

/**
 * Lightweight FS health classification for a profile install root.
 * No hashing, SteamCMD, or PowerShell — only existence/stat/readdir probes.
 */
export function classifyInstallHealth(
  installDir: string,
  binaryPath: string,
): {
  health: InstallationHealthStatus;
  reasonCodes: InstallationHealthReasonCode[];
} {
  const trimmed = installDir.trim();
  if (trimmed.length === 0) {
    return { health: "suspicious", reasonCodes: ["path_empty"] };
  }

  try {
    const rootStat = statSync(trimmed);
    if (!rootStat.isDirectory()) {
      return { health: "suspicious", reasonCodes: ["path_not_directory"] };
    }
  } catch (error) {
    if (isNotFoundErrno(error)) {
      return { health: "missing", reasonCodes: ["path_missing"] };
    }
    if (isAccessErrno(error)) {
      return { health: "inaccessible", reasonCodes: ["path_eacces"] };
    }
    return { health: "unknown", reasonCodes: ["io_error"] };
  }

  let exeStat: ReturnType<typeof statSync> | null = null;
  try {
    exeStat = statSync(binaryPath);
  } catch (error) {
    if (isAccessErrno(error)) {
      return { health: "inaccessible", reasonCodes: ["dir_eacces"] };
    }
    if (!isNotFoundErrno(error)) {
      return { health: "unknown", reasonCodes: ["io_error"] };
    }
  }

  if (exeStat !== null) {
    if (!exeStat.isFile()) {
      return { health: "suspicious", reasonCodes: ["exe_not_file"] };
    }
    if (exeStat.size <= 0) {
      return { health: "suspicious", reasonCodes: ["exe_empty"] };
    }
    return { health: "ready", reasonCodes: ["ready"] };
  }

  let entries: string[] = [];
  try {
    entries = readdirSync(trimmed);
  } catch (error) {
    if (isAccessErrno(error)) {
      return { health: "inaccessible", reasonCodes: ["dir_eacces"] };
    }
    return { health: "unknown", reasonCodes: ["io_error"] };
  }

  if (entries.length === 0) {
    return { health: "empty", reasonCodes: ["dir_empty"] };
  }

  if (hasAsaMarkers(trimmed)) {
    return { health: "incomplete", reasonCodes: ["partial_tree", "exe_absent"] };
  }

  // Non-empty folder without ASA markers — do not treat as a safe install target.
  return { health: "suspicious", reasonCodes: ["foreign_contents"] };
}

/** Async twin of {@link classifyInstallHealth} — uses libuv FS so UNC stalls do not block the event loop. */
export async function classifyInstallHealthAsync(
  installDir: string,
  binaryPath: string,
): Promise<{
  health: InstallationHealthStatus;
  reasonCodes: InstallationHealthReasonCode[];
}> {
  const trimmed = installDir.trim();
  if (trimmed.length === 0) {
    return { health: "suspicious", reasonCodes: ["path_empty"] };
  }

  try {
    const rootStat = await stat(trimmed);
    if (!rootStat.isDirectory()) {
      return { health: "suspicious", reasonCodes: ["path_not_directory"] };
    }
  } catch (error) {
    if (isNotFoundErrno(error)) {
      return { health: "missing", reasonCodes: ["path_missing"] };
    }
    if (isAccessErrno(error)) {
      return { health: "inaccessible", reasonCodes: ["path_eacces"] };
    }
    return { health: "unknown", reasonCodes: ["io_error"] };
  }

  let exeStat: Awaited<ReturnType<typeof stat>> | null = null;
  try {
    exeStat = await stat(binaryPath);
  } catch (error) {
    if (isAccessErrno(error)) {
      return { health: "inaccessible", reasonCodes: ["dir_eacces"] };
    }
    if (!isNotFoundErrno(error)) {
      return { health: "unknown", reasonCodes: ["io_error"] };
    }
  }

  if (exeStat !== null) {
    if (!exeStat.isFile()) {
      return { health: "suspicious", reasonCodes: ["exe_not_file"] };
    }
    if (exeStat.size <= 0) {
      return { health: "suspicious", reasonCodes: ["exe_empty"] };
    }
    return { health: "ready", reasonCodes: ["ready"] };
  }

  let entries: string[] = [];
  try {
    entries = await readdir(trimmed);
  } catch (error) {
    if (isAccessErrno(error)) {
      return { health: "inaccessible", reasonCodes: ["dir_eacces"] };
    }
    return { health: "unknown", reasonCodes: ["io_error"] };
  }

  if (entries.length === 0) {
    return { health: "empty", reasonCodes: ["dir_empty"] };
  }

  if (await hasAsaMarkersAsync(trimmed)) {
    return { health: "incomplete", reasonCodes: ["partial_tree", "exe_absent"] };
  }

  return { health: "suspicious", reasonCodes: ["foreign_contents"] };
}
