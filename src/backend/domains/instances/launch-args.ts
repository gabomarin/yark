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

/** True for the ASA/Unreal map URL arg (logical or Windows-verbatim form). */
export function isUnrealMapUrlArg(arg: string): boolean {
  return /SessionName=/.test(arg) && !arg.startsWith("-");
}

/**
 * Convert a logical map URL into the token that must appear on the Windows
 * CreateProcess command line so CommandLineToArgvW keeps literal `"` in argv.
 *
 * Logical:  `"TheIsland_WP"?SessionName="gabo"`
 * Verbatim: `\"TheIsland_WP\"?SessionName=\"gabo\"`
 *
 * Bare `"` on lpCommandLine are treated as delimiters and stripped from argv;
 * ASA's Commandline log then shows `TheIsland_WP?SessionName=gabo` with no quotes.
 * Prefacing each quote with `\` makes Windows keep them in argv (and Unreal/ASA
 * then logs the desired shape).
 */
export function mapUrlToWindowsVerbatimArg(logicalMapUrl: string): string {
  return logicalMapUrl.replace(/"/g, '\\"');
}

/**
 * Quote a Windows CreateProcess argument when it contains whitespace or quotes.
 * Doubles embedded quotes (Windows rules). Leaves simple flags untouched.
 * Does not touch map-URL tokens (use {@link mapUrlToWindowsVerbatimArg} first).
 */
export function quoteWindowsArg(value: string): string {
  if (value.length === 0) {
    return '""';
  }
  if (!/[\s"]/.test(value)) {
    return value;
  }
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * Builds the exact Windows lpCommandLine for CreateProcess, including a quoted
 * executable when needed and a verbatim map URL (`\"Map\"?SessionName=\"...\"`).
 */
export function buildWindowsCreateProcessCommandLine(
  binaryPath: string,
  args: string[],
): string {
  const parts: string[] = [quoteWindowsArg(binaryPath)];
  for (const arg of args) {
    if (isUnrealMapUrlArg(arg)) {
      // Accept either logical or already-verbatim map tokens.
      const verbatim = arg.includes('\\"')
        ? arg
        : mapUrlToWindowsVerbatimArg(arg);
      parts.push(verbatim);
      continue;
    }
    parts.push(quoteWindowsArg(arg));
  }
  return parts.join(" ");
}

/**
 * Args for `spawn(exe, args, { windowsVerbatimArguments: true })`.
 * Map URL is converted to the `\"...\"` form; other args are unchanged
 * (Node will not re-escape when verbatim is set — quote paths yourself if needed).
 */
export function buildWindowsVerbatimSpawnArgs(args: string[]): string[] {
  return args.map((arg) =>
    isUnrealMapUrlArg(arg) ? mapUrlToWindowsVerbatimArg(arg) : arg,
  );
}

/**
 * Builds launch arguments for ArkAscendedServer.exe (logical Unreal shape).
 *
 * Shape (ASA manager parity):
 * `"Map"?SessionName="..." -port=N -ServerPlatform=ALL ...`
 *
 * ProcessManager passes these logical args to `spawn(exe, args, {
 *   windowsVerbatimArguments: false, shell: false })`. Node's default
 * escaping quotes spaced exe paths and yields argv with real `"` on the map
 * token. Prefer that over `windowsVerbatimArguments: true` (breaks spaced
 * paths) or a `.cmd` / `cmd /c` wrapper (visible console + wrong tracked pid).
 *
 * {@link buildWindowsVerbatimSpawnArgs} / {@link buildWindowsCreateProcessCommandLine}
 * remain for diagnostics and CreateProcess lpCommandLine experiments.
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
