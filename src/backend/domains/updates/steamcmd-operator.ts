import type { SteamCmdStatus } from "@shared/types";
import type { UpdateCriticalJobType } from "./update-critical-jobs";

export type SteamCmdFilesOperation = "install-files" | "update" | "verify-files";
export type SteamCmdActiveOperation = SteamCmdFilesOperation | "install-steamcmd";

export interface SteamCmdProgressStart {
  percent: number | null;
  label: string;
  line: string;
}

const OFFICIAL_PROGRESS_WINDOW_MS = 5_000;

export function planSteamCmdProcessProgressStart(
  operation: SteamCmdActiveOperation,
): SteamCmdProgressStart {
  if (operation === "install-files") {
    return {
      percent: 0,
      label: "Downloading server files…",
      line: "Starting SteamCMD",
    };
  }
  if (operation === "update") {
    return {
      percent: 0,
      label: "Updating server files…",
      line: "Starting SteamCMD",
    };
  }
  if (operation === "verify-files") {
    return {
      percent: 0,
      label: "Verifying integrity…",
      line: "Starting SteamCMD validate",
    };
  }
  return {
    percent: null,
    label: "Installing SteamCMD…",
    line: "Starting SteamCMD installation",
  };
}

export function formatSteamCmdCachePathsLine(
  depotCacheDir: string,
  contentCacheDir: string,
): string {
  return `SteamCMD cache: depot=${depotCacheDir} | ASA content=${contentCacheDir}`;
}

export function formatAsaCacheReuseLine(ageSec: number): string {
  return `Reusing ASA content cache (updated ${ageSec}s ago; no re-download)`;
}

export function formatAsaCacheUpdateConsoleLine(
  operation: SteamCmdFilesOperation,
  steamCmdHome: string,
): string {
  if (operation === "verify-files") {
    return `Verifying ASA cache integrity via SteamCMD validate (depotcache at ${steamCmdHome})`;
  }
  return `Updating shared ASA cache via SteamCMD (reuses depotcache at ${steamCmdHome})`;
}

export function formatAsaCacheSyncTargetLine(installDir: string): string {
  return `Syncing ASA cache → ${installDir} (preserves ShooterGame\\Saved)`;
}

export function resolveAsaCacheSyncLabel(operation: SteamCmdFilesOperation): string {
  if (operation === "verify-files") {
    return "Applying verified files to server…";
  }
  if (operation === "install-files") {
    return "Copying files to server…";
  }
  return "Copying update to server…";
}

export function resolveAsaCacheSyncSkippedProgress(
  operation: SteamCmdFilesOperation,
): SteamCmdProgressStart {
  return {
    percent: 100,
    label: operation === "verify-files" ? "Integrity OK" : "Files already in sync",
    line: "No copy needed",
  };
}

export function resolveAsaCacheSyncCompleteProgress(
  operation: SteamCmdFilesOperation,
): SteamCmdProgressStart {
  if (operation === "verify-files") {
    return {
      percent: 100,
      label: "Integrity OK",
      line: "Verification complete",
    };
  }
  return {
    percent: 100,
    label: "Files synced",
    line: "Sync complete",
  };
}

export function formatSyncHeartbeatLine(elapsedSec: number): string {
  return `Still copying files… (${elapsedSec}s elapsed)`;
}

export function formatSyncCompletedLine(robocopyCode: number): string {
  return `ASA cache sync completed (robocopy=${robocopyCode})`;
}

export function formatSyncFailureFallbackLine(message: string): string {
  return `Cache sync failed; installing directly on the server: ${message}`;
}

export function formatSteamCmdInvokeConsoleLines(input: {
  operation: SteamCmdFilesOperation;
  serverId: string;
  steamCmdHome: string;
  steamcmdExe: string;
  args: readonly string[];
}): string[] {
  return [
    `[invoke] op=${input.operation} server=${input.serverId} cwd=${input.steamCmdHome} cmd=${input.steamcmdExe} args=${input.args.join(" ")}`,
    "Live progress: reading logs/console_log.txt + appmanifest/downloading for this install (SteamCMD stdout is often buffered).",
  ];
}

export function formatDiskProgressLogPathLine(logPath: string): string {
  return `Following live log: ${logPath}`;
}

export function shouldPreferOfficialProgressOverDiskEstimate(
  lastOfficialProgressAtMs: number,
  nowMs: number,
  windowMs: number = OFFICIAL_PROGRESS_WINDOW_MS,
): boolean {
  return (
    lastOfficialProgressAtMs > 0
    && nowMs - lastOfficialProgressAtMs < windowMs
  );
}

export function deriveSteamCmdStatusOperation(input: {
  syncingServerId: string | null;
  activeOperation: SteamCmdActiveOperation | null;
  runningJobType: UpdateCriticalJobType | null;
}): SteamCmdStatus["operation"] {
  if (input.syncingServerId !== null) {
    return "sync-files";
  }
  return input.activeOperation ?? input.runningJobType ?? null;
}

export function deriveSteamCmdStatusServerId(input: {
  syncingServerId: string | null;
  activeServerId: string | null;
  runningJobServerId: string | null;
}): string | null {
  return (
    input.syncingServerId
    ?? input.activeServerId
    ?? input.runningJobServerId
    ?? null
  );
}

export function deriveSteamCmdStatusStartedAt(input: {
  syncingStartedAt: string | null;
  activeStartedAt: string | null;
  runningJobUpdatedAt: string | null;
}): string | null {
  return (
    input.syncingStartedAt
    ?? input.activeStartedAt
    ?? input.runningJobUpdatedAt
    ?? null
  );
}
