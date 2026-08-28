import { join } from "node:path";
import type { UpdateCriticalJob } from "./update-critical-jobs";

export const STEAMCMD_MISSING_MESSAGE =
  "SteamCMD is not installed on this PC. Open Settings and install SteamCMD, then try again.";

/**
 * Ordered SteamCMD.exe candidates for disk discovery.
 * Isolated searches skip host Program Files / drive-root defaults.
 */
export function buildSteamCmdCandidatePaths(input: {
  configured?: string | null;
  envPath?: string | null;
  steamcmdDir: string;
  isolated: boolean;
  programFilesX86?: string;
  programFiles?: string;
  localAppData?: string;
}): string[] {
  const candidates: Array<string | null | undefined> = [
    input.configured,
    input.envPath,
    join(input.steamcmdDir, "steamcmd.exe"),
  ];
  if (input.isolated) {
    return candidates.filter(
      (value): value is string => value != null && value.trim().length > 0,
    );
  }
  const programFilesX86 = input.programFilesX86 ?? "C:\\Program Files (x86)";
  const programFiles = input.programFiles ?? "C:\\Program Files";
  return [
    ...candidates,
    "C:\\steamcmd\\steamcmd.exe",
    "D:\\steamcmd\\steamcmd.exe",
    join(programFilesX86, "SteamCMD", "steamcmd.exe"),
    join(programFiles, "SteamCMD", "steamcmd.exe"),
    join(programFilesX86, "Steam", "steamcmd.exe"),
    input.localAppData !== undefined
      ? join(input.localAppData, "Programs", "steamcmd", "steamcmd.exe")
      : null,
  ].filter((value): value is string => value != null && value.trim().length > 0);
}

/**
 * Status/cache path for polls — memory + settings/env only (no disk I/O, #145).
 * Callers apply any "remember configured path" side effects themselves.
 */
export function resolveSteamCmdExecutableCached(input: {
  confirmedMissing: boolean;
  lastKnownPath: string | null;
  configured: string | null | undefined;
  envPath: string | null | undefined;
}): string | null {
  if (input.confirmedMissing) {
    return null;
  }
  if (
    input.lastKnownPath != null
    && input.lastKnownPath.trim().length > 0
  ) {
    return input.lastKnownPath;
  }
  if (input.configured != null && input.configured.trim().length > 0) {
    return input.configured.trim();
  }
  if (input.envPath != null && input.envPath.trim().length > 0) {
    return input.envPath.trim();
  }
  return null;
}

export function normalizeSteamCmdExecutablePath(exePath: string): string {
  const normalized = exePath.trim();
  if (normalized.length === 0) {
    throw new Error("SteamCMD path is empty");
  }
  return normalized;
}

/** PowerShell -Command body that downloads and extracts steamcmd.zip into `steamcmdDir`. */
export function buildSteamCmdInstallPowerShell(steamcmdDir: string): string {
  const zipPath = join(steamcmdDir, "steamcmd.zip");
  const extractDir = join(steamcmdDir, "_extract");
  const q = (value: string): string => value.replace(/'/g, "''");
  return [
    "$ErrorActionPreference='Stop'",
    `$target='${q(steamcmdDir)}'`,
    `$zip='${q(zipPath)}'`,
    `$extract='${q(extractDir)}'`,
    "$url='https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip'",
    "if (Test-Path -LiteralPath $extract) { Remove-Item -LiteralPath $extract -Recurse -Force }",
    "if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }",
    "Invoke-WebRequest -Uri $url -OutFile $zip",
    "Expand-Archive -LiteralPath $zip -DestinationPath $extract -Force",
    "$candidateExe = Join-Path $target 'steamcmd.exe'",
    "if (Test-Path -LiteralPath $candidateExe) {",
    "  $backupExe = Join-Path $target 'steamcmd.exe.bak'",
    "  if (Test-Path -LiteralPath $backupExe) { Remove-Item -LiteralPath $backupExe -Force -ErrorAction SilentlyContinue }",
    "  try { Rename-Item -LiteralPath $candidateExe -NewName 'steamcmd.exe.bak' -Force -ErrorAction Stop } catch {}",
    "}",
    "Copy-Item -Path (Join-Path $extract '*') -Destination $target -Recurse -Force",
    "if (Test-Path -LiteralPath $extract) { Remove-Item -LiteralPath $extract -Recurse -Force }",
    "if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }",
    "$backupExe = Join-Path $target 'steamcmd.exe.bak'",
    "if (Test-Path -LiteralPath $backupExe) { Remove-Item -LiteralPath $backupExe -Force -ErrorAction SilentlyContinue }",
  ].join("; ");
}

export function isSteamCmdVerifyExitAcceptable(
  code: number | null,
  sawOutput: boolean,
): boolean {
  return (code ?? 1) === 0 || sawOutput;
}

/** True when this job still needs steamcmd.exe (not a post-SteamCMD recovery phase). */
export function updateJobNeedsSteamCmdExecutable(
  job: Pick<UpdateCriticalJob, "type" | "phase">,
): boolean {
  if (job.phase === "files-applied" || job.phase === "restarting-server") {
    return false;
  }
  if (job.phase.startsWith("rollback-") && job.phase !== "rollback-complete") {
    return false;
  }
  return (
    job.type === "install-files"
    || job.type === "update"
    || job.type === "verify-files"
  );
}
