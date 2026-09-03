import { closeSync, existsSync, openSync, readFileSync, readdirSync, readSync, statSync } from "node:fs";
import { access, open, readFile, readdir, stat } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import {
  buildInstallationHealthFields,
  type InstallationHealthReasonCode,
} from "@shared/installation-health";
import { isArkStyleVersion } from "@shared/server-version-display";
import type {
  InstallationHealthStatus,
  ServerInstallationInfo,
} from "@shared/types";
import { execFileBounded } from "../../infra/process/exec-file-bounded";
import { serverBinaryPath } from "./launch-args";
import {
  classifyInstallHealth,
  classifyInstallHealthAsync,
} from "./install-health";
import {
  normalizePath,
  readLocalSteamManifestMtimeMs,
  readLocalSteamManifestMtimeMsAsync,
  readSteamBuildFromLocalManifest,
  readSteamBuildFromLocalManifestAsync,
} from "./install-steam-build";

export {
  extractOfficialVersionFromStatusText,
  parseOfficialServerStatus,
  readOfficialArkBuildCached,
  readOfficialArkVersionCached,
} from "./official-ark-probe";
export type { OfficialArkVersionProbe } from "./official-ark-probe";

export { classifyInstallHealthAsync } from "./install-health";

function firstMeaningfulLine(content: string): string | null {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return lines[0] ?? null;
}

function versionCandidatePaths(installDir: string): string[] {
  return [
    join(installDir, "ShooterGame", "Binaries", "Win64", "version.txt"),
    join(installDir, "ShooterGame", "Binaries", "Win64", "version"),
    join(installDir, "ShooterGame", "Binaries", "Win64", "Build.version"),
    join(installDir, "ShooterGame", "Build", "Build.version"),
    join(installDir, "Engine", "Build", "Build.version"),
    join(installDir, "Engine", "Binaries", "Win64", "Build.version"),
    join(installDir, "version.txt"),
  ];
}

function parseVersionFileContent(rawInput: string): string | null {
  const raw = rawInput.trim();
  if (raw.length === 0) {
    return null;
  }

  if (raw.startsWith("{")) {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const buildVersion = parsed.BuildVersion ?? parsed.buildVersion ?? parsed.Version;
    if (typeof buildVersion === "string" && buildVersion.trim().length > 0) {
      return buildVersion.trim();
    }
    const changelist = parsed.Changelist ?? parsed.changelist;
    if (typeof changelist === "number") {
      return `CL ${changelist}`;
    }
    if (typeof changelist === "string" && changelist.trim().length > 0) {
      return `CL ${changelist.trim()}`;
    }
  }

  return firstMeaningfulLine(raw);
}

function readVersionFromKnownFiles(installDir: string): string | null {
  for (const filePath of versionCandidatePaths(installDir)) {
    if (!existsSync(filePath)) {
      continue;
    }
    try {
      const parsed = parseVersionFileContent(readFileSync(filePath, "utf8"));
      if (parsed !== null) {
        return parsed;
      }
    } catch {
      // Best effort: if a version file is corrupt, try the next source.
    }
  }

  return null;
}

async function readVersionFromKnownFilesAsync(
  installDir: string,
): Promise<string | null> {
  for (const filePath of versionCandidatePaths(installDir)) {
    try {
      const parsed = parseVersionFileContent(await readFile(filePath, "utf8"));
      if (parsed !== null) {
        return parsed;
      }
    } catch {
      // Missing or corrupt — try the next source.
    }
  }
  return null;
}

function readVersionFromExecutable(binaryPath: string): string | null {
  if (!existsSync(binaryPath)) {
    return null;
  }

  const escapedPath = binaryPath.replace(/'/g, "''");
  try {
    const raw = execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `$i=(Get-Item -LiteralPath '${escapedPath}').VersionInfo; $v=$i.ProductVersion; if(-not $v){$v=$i.FileVersion}; if($v){$v}`,
      ],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 2_500,
      },
    );
    const version = raw.trim();
    return version.length > 0 ? version : null;
  } catch {
    return null;
  }
}

async function readVersionFromExecutableAsync(
  binaryPath: string,
): Promise<string | null> {
  try {
    await access(binaryPath);
  } catch {
    return null;
  }

  const escapedPath = binaryPath.replace(/'/g, "''");
  try {
    const { stdout } = await execFileBounded(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `$i=(Get-Item -LiteralPath '${escapedPath}').VersionInfo; $v=$i.ProductVersion; if(-not $v){$v=$i.FileVersion}; if($v){$v}`,
      ],
      {
        timeoutMs: 2_500,
        maxBuffer: 64 * 1024,
        windowsHide: true,
      },
    );
    const version = stdout.trim();
    return version.length > 0 ? version : null;
  } catch {
    return null;
  }
}

function readArkVersionFromLogs(installDir: string): string | null {
  const logsDir = join(installDir, "ShooterGame", "Saved", "Logs");
  if (!existsSync(logsDir)) {
    return null;
  }

  let logNames: string[];
  try {
    logNames = readdirSync(logsDir)
      .filter((name) => /\.(log|txt)$/i.test(name));
  } catch {
    return null;
  }

  const sorted = logNames
    .map((name) => {
      const fullPath = join(logsDir, name);
      let mtimeMs = 0;
      try {
        mtimeMs = statSync(fullPath).mtimeMs;
      } catch {
        mtimeMs = 0;
      }
      return { name, fullPath, mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  for (const item of sorted) {
    try {
      const raw = readFileTailSync(item.fullPath, 256 * 1024);
      const match = raw.match(/ARK\s+Version\s*:\s*([^\r\n]+)/i);
      if (match?.[1] !== undefined) {
        const version = match[1].trim();
        if (version.length > 0) {
          return version;
        }
      }
    } catch {
      // Best effort: skip unreadable logs.
    }
  }

  return null;
}

async function readArkVersionFromLogsAsync(
  installDir: string,
): Promise<string | null> {
  const logsDir = join(installDir, "ShooterGame", "Saved", "Logs");
  let logNames: string[];
  try {
    logNames = (await readdir(logsDir)).filter((name) =>
      /\.(log|txt)$/i.test(name),
    );
  } catch {
    return null;
  }

  const withMtime = await Promise.all(
    logNames.map(async (name) => {
      const fullPath = join(logsDir, name);
      let mtimeMs = 0;
      try {
        mtimeMs = (await stat(fullPath)).mtimeMs;
      } catch {
        mtimeMs = 0;
      }
      return { fullPath, mtimeMs };
    }),
  );
  withMtime.sort((a, b) => b.mtimeMs - a.mtimeMs);

  for (const item of withMtime) {
    try {
      const raw = await readFileTailAsync(item.fullPath, 256 * 1024);
      const match = raw.match(/ARK\s+Version\s*:\s*([^\r\n]+)/i);
      if (match?.[1] !== undefined) {
        const version = match[1].trim();
        if (version.length > 0) {
          return version;
        }
      }
    } catch {
      // Best effort: skip unreadable logs.
    }
  }

  return null;
}

/** Read the last `maxBytes` of a file without loading the whole thing into memory. */
function readFileTailSync(filePath: string, maxBytes: number): string {
  const { size } = statSync(filePath);
  if (size <= maxBytes) {
    return readFileSync(filePath, "utf8");
  }
  const fd = openSync(filePath, "r");
  try {
    const length = Math.min(maxBytes, size);
    const start = size - length;
    const buffer = Buffer.alloc(length);
    try {
      readSync(fd, buffer, 0, length, start);
      return buffer.toString("utf8");
    } catch {
      return readFileSync(filePath, "utf8");
    }
  } finally {
    closeSync(fd);
  }
}

async function readFileTailAsync(
  filePath: string,
  maxBytes: number,
): Promise<string> {
  const { size } = await stat(filePath);
  if (size <= maxBytes) {
    return readFile(filePath, "utf8");
  }
  const handle = await open(filePath, "r");
  try {
    const length = Math.min(maxBytes, size);
    const start = size - length;
    const buffer = Buffer.alloc(length);
    try {
      await handle.read(buffer, 0, length, start);
      return buffer.toString("utf8");
    } catch {
      return readFile(filePath, "utf8");
    }
  } finally {
    await handle.close();
  }
}

/**
 * True when install-dir Steam appmanifest is newer than version.txt / logs that
 * feed the displayed ARK Version — after Update/Verify, before the next boot.
 */
function versionRefreshPendingFromSources(input: {
  manifestMtimeMs: number | null;
  build: string | null;
  arkVersion: string | null;
  versionFileMtimeMs: number | null;
  newestLogMtimeMs: number | null;
}): boolean {
  if (input.manifestMtimeMs == null) return false;
  const hasDisplay =
    (input.build !== null && isArkStyleVersion(input.build))
    || (input.arkVersion !== null && isArkStyleVersion(input.arkVersion));
  if (!hasDisplay) return false;

  const sourceMtimes: number[] = [];
  if (input.build !== null && isArkStyleVersion(input.build) && input.versionFileMtimeMs != null) {
    sourceMtimes.push(input.versionFileMtimeMs);
  }
  if (input.arkVersion !== null && isArkStyleVersion(input.arkVersion) && input.newestLogMtimeMs != null) {
    sourceMtimes.push(input.newestLogMtimeMs);
  }
  if (sourceMtimes.length === 0) return false;
  return Math.max(...sourceMtimes) < input.manifestMtimeMs;
}

function maxExistingMtimeMs(paths: string[]): number | null {
  let max: number | null = null;
  for (const filePath of paths) {
    try {
      if (!existsSync(filePath)) continue;
      const mtimeMs = statSync(filePath).mtimeMs;
      if (max === null || mtimeMs > max) max = mtimeMs;
    } catch {
      // Best effort.
    }
  }
  return max;
}

async function maxExistingMtimeMsAsync(paths: string[]): Promise<number | null> {
  let max: number | null = null;
  for (const filePath of paths) {
    try {
      const mtimeMs = (await stat(filePath)).mtimeMs;
      if (max === null || mtimeMs > max) max = mtimeMs;
    } catch {
      // Best effort.
    }
  }
  return max;
}

function newestLogMtimeMsSync(installDir: string): number | null {
  const logsDir = join(installDir, "ShooterGame", "Saved", "Logs");
  if (!existsSync(logsDir)) return null;
  let logNames: string[];
  try {
    logNames = readdirSync(logsDir).filter((name) => /\.(log|txt)$/i.test(name));
  } catch {
    return null;
  }
  return maxExistingMtimeMs(logNames.map((name) => join(logsDir, name)));
}

async function newestLogMtimeMsAsync(installDir: string): Promise<number | null> {
  const logsDir = join(installDir, "ShooterGame", "Saved", "Logs");
  let logNames: string[];
  try {
    logNames = (await readdir(logsDir)).filter((name) => /\.(log|txt)$/i.test(name));
  } catch {
    return null;
  }
  return maxExistingMtimeMsAsync(logNames.map((name) => join(logsDir, name)));
}

const INSTALL_INSPECT_TTL_MS = 20_000;

const installInspectCache = new Map<
  string,
  { checkedAt: number; info: ServerInstallationInfo }
>();

export type InspectServerInstallationOptions = {
  bypassCache?: boolean;
  /**
   * When true, may call sync PowerShell VersionInfo (can stall main ~1–2s).
   * Fleet scans keep this false so Overview stays responsive.
   */
  allowExecutableVersionProbe?: boolean;
  /**
   * When true, may read ASA log tails for ARK Version (I/O heavy on large logs).
   * Fleet scans keep this false.
   */
  allowLogVersionProbe?: boolean;
};

function buildInspectedInstallation(
  serverId: string,
  installDir: string,
  classified: {
    health: InstallationHealthStatus;
    reasonCodes: InstallationHealthReasonCode[];
  },
  options?: InspectServerInstallationOptions,
): ServerInstallationInfo {
  const healthFields = buildInstallationHealthFields(
    classified.health,
    classified.reasonCodes,
  );
  const ready = healthFields.installed;
  const binaryPath = serverBinaryPath(installDir);

  // Cheap version sources only by default. PowerShell + log tails are opt-in so
  // fleet scans cannot freeze Electron across many ready installs.
  // Steam buildids stay on `steamBuild` only — never in display `build`/`version`
  // (those are ARK-style product versions like 92.28).
  // Update compare uses install-dir appmanifest only (#490) — never shared SteamCMD.
  const steamBuild = ready
    ? readSteamBuildFromLocalManifest(installDir)
    : null;
  const build = ready
    ? (
        readVersionFromKnownFiles(installDir) ??
        (options?.allowExecutableVersionProbe === true
          ? readVersionFromExecutable(binaryPath)
          : null)
      )
    : null;
  const arkVersion =
    ready && options?.allowLogVersionProbe === true
      ? readArkVersionFromLogs(installDir)
      : null;
  const versionRefreshPending = ready
    ? versionRefreshPendingFromSources({
        manifestMtimeMs: readLocalSteamManifestMtimeMs(installDir),
        build,
        arkVersion,
        versionFileMtimeMs: maxExistingMtimeMs(versionCandidatePaths(installDir)),
        newestLogMtimeMs: newestLogMtimeMsSync(installDir),
      })
    : false;

  return {
    serverId,
    ...healthFields,
    build,
    steamBuild,
    arkVersion,
    versionRefreshPending,
    version: build,
    binaryPath,
    checkedAt: new Date().toISOString(),
  };
}

async function buildInspectedInstallationAsync(
  serverId: string,
  installDir: string,
  classified: {
    health: InstallationHealthStatus;
    reasonCodes: InstallationHealthReasonCode[];
  },
  options?: InspectServerInstallationOptions,
): Promise<ServerInstallationInfo> {
  const healthFields = buildInstallationHealthFields(
    classified.health,
    classified.reasonCodes,
  );
  const ready = healthFields.installed;
  const binaryPath = serverBinaryPath(installDir);

  let steamBuild: string | null = null;
  let build: string | null = null;
  let arkVersion: string | null = null;

  if (ready) {
    steamBuild = await readSteamBuildFromLocalManifestAsync(installDir);
    build =
      (await readVersionFromKnownFilesAsync(installDir))
      ?? (
        options?.allowExecutableVersionProbe === true
          ? await readVersionFromExecutableAsync(binaryPath)
          : null
      );
    if (options?.allowLogVersionProbe === true) {
      arkVersion = await readArkVersionFromLogsAsync(installDir);
    }
  }

  const versionRefreshPending = ready
    ? versionRefreshPendingFromSources({
        manifestMtimeMs: await readLocalSteamManifestMtimeMsAsync(installDir),
        build,
        arkVersion,
        versionFileMtimeMs: await maxExistingMtimeMsAsync(
          versionCandidatePaths(installDir),
        ),
        newestLogMtimeMs: await newestLogMtimeMsAsync(installDir),
      })
    : false;

  return {
    serverId,
    ...healthFields,
    build,
    steamBuild,
    arkVersion,
    versionRefreshPending,
    version: build,
    binaryPath,
    checkedAt: new Date().toISOString(),
  };
}

function readInstallInspectCache(
  serverId: string,
  installDir: string,
  bypassCache: boolean | undefined,
): ServerInstallationInfo | null {
  if (bypassCache === true) {
    return null;
  }
  const cacheKey = `${serverId}\0${normalizePath(installDir)}`;
  const cached = installInspectCache.get(cacheKey);
  const now = Date.now();
  if (cached !== undefined && now - cached.checkedAt < INSTALL_INSPECT_TTL_MS) {
    return { ...cached.info, serverId, checkedAt: cached.info.checkedAt };
  }
  return null;
}

function writeInstallInspectCache(
  serverId: string,
  installDir: string,
  info: ServerInstallationInfo,
): void {
  const cacheKey = `${serverId}\0${normalizePath(installDir)}`;
  installInspectCache.set(cacheKey, { checkedAt: Date.now(), info });
}

/** Drop cached inspect rows for a server (call after Move installation commit). */
export function invalidateInstallInspectCache(serverId: string): void {
  const prefix = `${serverId}\0`;
  for (const key of installInspectCache.keys()) {
    if (key.startsWith(prefix)) {
      installInspectCache.delete(key);
    }
  }
}

export function inspectServerInstallation(
  serverId: string,
  installDir: string,
  options?: InspectServerInstallationOptions,
): ServerInstallationInfo {
  const cached = readInstallInspectCache(serverId, installDir, options?.bypassCache);
  if (cached !== null) {
    return cached;
  }

  const binaryPath = serverBinaryPath(installDir);
  const classified = classifyInstallHealth(installDir, binaryPath);
  const info = buildInspectedInstallation(serverId, installDir, classified, options);
  writeInstallInspectCache(serverId, installDir, info);
  return info;
}

/**
 * Async inspect for fleet scans and enriched single-server checks.
 * Classification and version/manifest probes use promise FS / bounded exec so
 * slow disks and PowerShell cannot block the Electron main thread (#145).
 */
export async function inspectServerInstallationAsync(
  serverId: string,
  installDir: string,
  options?: InspectServerInstallationOptions,
): Promise<ServerInstallationInfo> {
  const cached = readInstallInspectCache(serverId, installDir, options?.bypassCache);
  if (cached !== null) {
    return cached;
  }

  const binaryPath = serverBinaryPath(installDir);
  const classified = await classifyInstallHealthAsync(installDir, binaryPath);
  const info = await buildInspectedInstallationAsync(
    serverId,
    installDir,
    classified,
    options,
  );
  writeInstallInspectCache(serverId, installDir, info);
  return info;
}
