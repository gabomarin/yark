import { join } from "node:path";
import type { ServerProfile } from "@shared/types";

/** Path to the dedicated server executable inside the install. */
export function serverBinaryPath(installDir: string): string {
  return join(
    installDir,
    "ShooterGame",
    "Binaries",
    "Win64",
    "ArkAscendedServer.exe",
  );
}

function escapeQuotedValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function extraArgsIncludeServerPlatform(extraArgs: string[]): boolean {
  return extraArgs.some((arg) => /ServerPlatform/i.test(arg));
}

/**
 * Logical Unreal map URL (what ASA should log / what we show in the UI):
 * `"TheIsland_WP"?SessionName="gabo"`
 */
export function buildMapUrlArg(map: string, sessionName: string): string {
  return `"${map}"?SessionName="${escapeQuotedValue(sessionName)}"`;
}

/** True for the ASA/Unreal map URL argument. */
export function isUnrealMapUrlArg(arg: string): boolean {
  return /SessionName=/.test(arg) && !arg.startsWith("-");
}

/**
 * Quote a Windows CreateProcess argument when it contains whitespace or quotes.
 * Leaves simple flags untouched. Map-URL tokens must bypass this function so
 * their map and SessionName quotes remain separate on ASA's raw command line.
 */
export function quoteWindowsArg(value: string): string {
  if (value.length === 0) {
    return '""';
  }
  if (!/[\s"]/.test(value)) {
    return value;
  }
  let quoted = '"';
  let backslashes = 0;

  for (const char of value) {
    if (char === "\\") {
      backslashes += 1;
      continue;
    }
    if (char === '"') {
      quoted += `${"\\".repeat(backslashes * 2 + 1)}"`;
      backslashes = 0;
      continue;
    }
    quoted += `${"\\".repeat(backslashes)}${char}`;
    backslashes = 0;
  }

  return `${quoted}${"\\".repeat(backslashes * 2)}"`;
}

/**
 * Builds the exact Windows lpCommandLine for CreateProcess, including a quoted
 * executable when needed and a literal map URL (`"Map"?SessionName="..."`).
 */
export function buildWindowsCreateProcessCommandLine(
  binaryPath: string,
  args: string[],
): string {
  const parts: string[] = [quoteWindowsArg(binaryPath)];
  for (const arg of args) {
    if (isUnrealMapUrlArg(arg)) {
      parts.push(arg);
      continue;
    }
    parts.push(quoteWindowsArg(arg));
  }
  return parts.join(" ");
}

/**
 * Args for `spawn(exe, args, { windowsVerbatimArguments: true })`.
 * The map URL remains literal so ASA receives no extra outer quote pair.
 * Other arguments are quoted individually when Windows whitespace requires it.
 */
export function buildWindowsVerbatimSpawnArgs(args: string[]): string[] {
  return args.map((arg) =>
    isUnrealMapUrlArg(arg) ? arg : quoteWindowsArg(arg),
  );
}

/**
 * Builds launch arguments for ArkAscendedServer.exe (logical Unreal shape).
 *
 * Shape (ASA manager parity):
 * `"Map"?SessionName="..." -port=N -ServerPlatform=ALL ...`
 *
 * On Windows, ProcessManager converts these with
 * {@link buildWindowsVerbatimSpawnArgs} and enables
 * `windowsVerbatimArguments`. This prevents Node from wrapping the complete
 * spaced map URL in another pair of quotes.
 */
export function buildLaunchArgs(profile: ServerProfile): string[] {
  const mapUrl = buildMapUrlArg(profile.map, profile.sessionName);
  const args: string[] = [mapUrl, `-port=${profile.gamePort}`];

  if (!extraArgsIncludeServerPlatform(profile.extraArgs)) {
    args.push("-ServerPlatform=ALL");
  }

  const disabledMods = new Set(profile.disabledMods ?? []);
  const enabledMods = profile.mods.filter((id) => !disabledMods.has(id));
  if (enabledMods.length > 0) {
    args.push(`-mods=${enabledMods.join(",")}`);
  }
  if (profile.clusterId !== null && profile.clusterDir !== null) {
    args.push(`-clusterid=${profile.clusterId}`);
    args.push(`-ClusterDirOverride=${profile.clusterDir}`);
    args.push("-NoTransferFromFiltering");
  }
  args.push(...profile.extraArgs);
  return args;
}

/**
 * Formats the dedicated-server command line for UI/logs (logical quotes, not `\"`).
 * When `binaryPath` is set, prefixes the exe with Windows path quoting only.
 */
export function formatLaunchCommandLine(
  profile: ServerProfile,
  binaryPath?: string,
): string {
  const args = buildLaunchArgs(profile);
  if (binaryPath === undefined) {
    return args.join(" ");
  }
  return [quoteWindowsArg(binaryPath), ...args].join(" ");
}
