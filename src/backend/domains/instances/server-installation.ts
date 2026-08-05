import { closeSync, existsSync, openSync, readFileSync, readdirSync, readSync, statSync } from "node:fs";
import { access, readdir, stat } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { get } from "node:https";
import { dirname, join } from "node:path";
import {
  buildInstallationHealthFields,
  type InstallationHealthReasonCode,
} from "@shared/installation-health";
import type {
  InstallationHealthStatus,
  OfficialNetworkStatus,
  ServerInstallationInfo,
} from "@shared/types";
import { serverBinaryPath } from "./launch-args";

const ASA_APP_ID = "2430930";
const OFFICIAL_VERSION_TTL_MS = 15 * 60 * 1000;
const OFFICIAL_SERVER_STATUS_URL =
  "https://cdn2.arkdedicated.com/asa/officialserverstatus.ini";

let officialVersionCache: {
  value: string | null;
  networkStatus: OfficialNetworkStatus;
  checkedAt: number;
  inFlight: Promise<OfficialArkVersionProbe> | null;
} = {
  value: null,
  networkStatus: "unknown",
  checkedAt: 0,
  inFlight: null,
};

let officialBuildCache: {
  value: string | null;
  checkedAt: number;
  inFlight: Promise<string | null> | null;
} = {
  value: null,
  checkedAt: 0,
  inFlight: null,
};

function firstMeaningfulLine(content: string): string | null {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return lines[0] ?? null;
}

function readVersionFromKnownFiles(installDir: string): string | null {
  const candidates = [
    join(installDir, "ShooterGame", "Binaries", "Win64", "version.txt"),
    join(installDir, "ShooterGame", "Binaries", "Win64", "version"),
    join(installDir, "ShooterGame", "Binaries", "Win64", "Build.version"),
    join(installDir, "ShooterGame", "Build", "Build.version"),
    join(installDir, "Engine", "Build", "Build.version"),
    join(installDir, "Engine", "Binaries", "Win64", "Build.version"),
    join(installDir, "version.txt"),
  ];

  for (const filePath of candidates) {
    if (!existsSync(filePath)) {
      continue;
    }
    try {
      const raw = readFileSync(filePath, "utf8").trim();
      if (raw.length === 0) {
        continue;
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

      const line = firstMeaningfulLine(raw);
      if (line !== null) {
        return line;
      }
    } catch {
      // Best effort: if a version file is corrupt, try the next source.
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
    // Best effort: some binaries do not expose ProductVersion or PowerShell is unavailable.
    return null;
  }
}

/** Collapse path separators for stable Windows install-dir comparisons/cache keys. */
function normalizePath(value: string): string {
  return value.trim().replace(/[\\/]+/g, "\\");
}

function collectManifestRoots(installDir: string): string[] {
  const roots: string[] = [];
  const seen = new Set<string>();

  const addRoot = (value: string | null | undefined): void => {
    if (value == null || value.trim().length === 0) {
      return;
    }
    let normalized = normalizePath(value);
    if (normalized.toLowerCase().endsWith(".exe")) {
      normalized = dirname(normalized);
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    roots.push(normalized);
  };

  let current = normalizePath(installDir);
  for (;;) {
    addRoot(current);
    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  addRoot(process.env["ARK_STEAMCMD_DIR"]);
  addRoot(process.env["STEAMCMD_DIR"]);
  addRoot(process.env["STEAMCMD_PATH"]);

  for (const drive of "CDEFGHIJKLMNOPQRSTUVWXYZ") {
    addRoot(`${drive}:\\steamcmd`);
    addRoot(`${drive}:\\SteamCMD`);
    addRoot(`${drive}:\\tools\\steamcmd`);
  }

  return roots;
}

function readSteamBuildFromLocalManifest(installDir: string): string | null {
  const manifestPath = join(installDir, "steamapps", `appmanifest_${ASA_APP_ID}.acf`);
  if (!existsSync(manifestPath)) {
    return null;
  }
  try {
    const content = readFileSync(manifestPath, "utf8");
    const buildId = content.match(/"buildid"\s+"([^"]+)"/i)?.[1]?.trim() ?? "";
    return buildId.length > 0 ? `build ${buildId}` : null;
  } catch {
    return null;
  }
}

function readBuildIdFromManifest(installDir: string): string | null {
  const installDirNormalized = normalizePath(installDir).toLowerCase();
  const installDirLeaf = installDirNormalized
    .split("\\")
    .filter((part) => part.length > 0)
    .at(-1);

  const roots = collectManifestRoots(installDir);
  const fallbackBuildIds = new Set<string>();

  for (const root of roots) {
    const manifestPath = join(root, "steamapps", `appmanifest_${ASA_APP_ID}.acf`);
    if (!existsSync(manifestPath)) {
      continue;
    }
    try {
      const content = readFileSync(manifestPath, "utf8");
      const buildMatch = content.match(/"buildid"\s+"([^"]+)"/i);
      const installMatch = content.match(/"installdir"\s+"([^"]+)"/i);
      const buildId = buildMatch?.[1]?.trim() ?? "";
      const manifestInstallDir = installMatch?.[1]?.trim().replace(/[\\/]+/g, "\\").toLowerCase() ?? "";

      if (buildId.length === 0 || manifestInstallDir.length === 0) {
        continue;
      }

      const manifestLeaf = manifestInstallDir
        .split("\\")
        .filter((part) => part.length > 0)
        .at(-1);

      const matchesInstallDir =
        manifestInstallDir === installDirNormalized ||
        installDirNormalized.endsWith(`\\${manifestInstallDir}`) ||
        (installDirLeaf !== undefined && manifestLeaf !== undefined && installDirLeaf === manifestLeaf);

      if (matchesInstallDir) {
        return `build ${buildId}`;
      }

      fallbackBuildIds.add(buildId);
    } catch {
      // Best effort: omite manifest ilegible.
    }
  }

  if (fallbackBuildIds.size === 1) {
    const onlyBuildId = [...fallbackBuildIds][0];
    if (onlyBuildId !== undefined && onlyBuildId.length > 0) {
      return `build ${onlyBuildId}`;
    }
  }

  return null;
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
      // Only scan the newest logs; ASA logs can be multi-MB and sync reads
      // on the Electron main process freeze the UI.
      const raw = readFileTailSync(item.fullPath, 256 * 1024);
      const match = raw.match(/ARK\s+Version\s*:\s*([^\r\n]+)/i);
      if (match?.[1] !== undefined) {
        const version = match[1].trim();
        if (version.length > 0) {
          return version;
        }
      }
    } catch {
      // Best effort: omite logs no legibles.
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
      // Tail read can fail on some volumes; fall back to a full read.
      return readFileSync(filePath, "utf8");
    }
  } finally {
    closeSync(fd);
  }
}

function readPathValue(source: unknown, path: string[]): unknown {
  let current: unknown = source;
  for (const segment of path) {
    if (typeof current !== "object" || current === null) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function normalizeBuildId(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return `${Math.trunc(value)}`;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}

function extractOfficialBuildFromPayload(payload: unknown): string | null {
  const appNode =
    readPathValue(payload, ["data", ASA_APP_ID]) ??
    readPathValue(payload, [ASA_APP_ID]) ??
    readPathValue(payload, ["response", ASA_APP_ID]);

  const candidates = [
    readPathValue(appNode, ["depots", "branches", "public", "buildid"]),
    readPathValue(appNode, ["depots", "branches", "public", "BuildID"]),
    readPathValue(appNode, ["common", "buildid"]),
    readPathValue(appNode, ["buildid"]),
  ];

  for (const candidate of candidates) {
    const buildId = normalizeBuildId(candidate);
    if (buildId !== null) {
      return `build ${buildId}`;
    }
  }

  return null;
}

function fetchOfficialArkBuild(): Promise<string | null> {
  return new Promise((resolve) => {
    const req = get("https://api.steamcmd.net/v1/info/2430930", (res) => {
      if ((res.statusCode ?? 500) >= 400) {
        resolve(null);
        res.resume();
        return;
      }

      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(body) as unknown;
          resolve(extractOfficialBuildFromPayload(parsed));
        } catch {
          resolve(null);
        }
      });
    });

    req.setTimeout(3_500, () => {
      req.destroy();
      resolve(null);
    });

    req.on("error", () => {
      resolve(null);
    });
  });
}

export function extractOfficialVersionFromStatusText(content: string): string | null {
  return parseOfficialServerStatus(content).version;
}

export interface OfficialArkVersionProbe {
  version: string | null;
  networkStatus: OfficialNetworkStatus;
}

export function parseOfficialServerStatus(content: string): OfficialArkVersionProbe {
  const versionMatch = content.match(/\(\s*v(\d+(?:\.\d+)+)\s*\)/i);
  const version = versionMatch?.[1] ?? null;

  const statusMatch =
    content.match(/>\s*(Online|Deploying|Offline|Healthy)\b/i) ??
    content.match(/\b(Online|Deploying|Offline|Healthy)\b/i);
  const rawStatus = statusMatch?.[1]?.toLowerCase() ?? "";

  let networkStatus: OfficialNetworkStatus = "unknown";
  if (rawStatus === "online" || rawStatus === "healthy") {
    networkStatus = "online";
  } else if (rawStatus === "deploying") {
    networkStatus = "deploying";
  } else if (rawStatus === "offline") {
    networkStatus = "offline";
  }

  return { version, networkStatus };
}

function fetchOfficialArkVersion(): Promise<OfficialArkVersionProbe> {
  return new Promise((resolve) => {
    const req = get(
      OFFICIAL_SERVER_STATUS_URL,
      {
        headers: {
          accept: "text/plain, */*",
          "user-agent": "yark-server-manager/1.0",
        },
      },
      (res) => {
        if ((res.statusCode ?? 500) >= 400) {
          resolve({ version: null, networkStatus: "unknown" });
          res.resume();
          return;
        }

        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          resolve(parseOfficialServerStatus(body));
        });
      },
    );

    req.setTimeout(3_500, () => {
      req.destroy();
      resolve({ version: null, networkStatus: "unknown" });
    });

    req.on("error", () => {
      resolve({ version: null, networkStatus: "unknown" });
    });
  });
}

/**
 * Cached Wildcard official-network probe (`officialserverstatus.ini`).
 * - Success: cached for `OFFICIAL_VERSION_TTL_MS` (~15m) unless `force`.
 * - Concurrent callers share one in-flight request.
 * - Failed probe: keep last success when available; otherwise shorten TTL (~30s)
 *   so the next poll can retry without waiting the full window.
 */
export async function readOfficialArkVersionCached(
  force = false,
): Promise<OfficialArkVersionProbe> {
  const now = Date.now();
  if (!force && now - officialVersionCache.checkedAt < OFFICIAL_VERSION_TTL_MS) {
    return {
      version: officialVersionCache.value,
      networkStatus: officialVersionCache.networkStatus,
    };
  }

  if (officialVersionCache.inFlight !== null) {
    return officialVersionCache.inFlight;
  }

  officialVersionCache.inFlight = fetchOfficialArkVersion()
    .then((probe) => {
      if (probe.version !== null) {
        officialVersionCache.value = probe.version;
        officialVersionCache.networkStatus = probe.networkStatus;
        officialVersionCache.checkedAt = Date.now();
        return probe;
      }
      // Do not lock a failed probe for the full TTL — retry soon, keep last success.
      if (officialVersionCache.value === null) {
        officialVersionCache.checkedAt =
          Date.now() - OFFICIAL_VERSION_TTL_MS + 30_000;
        officialVersionCache.networkStatus = probe.networkStatus;
      }
      return {
        version: officialVersionCache.value,
        networkStatus:
          officialVersionCache.value !== null
            ? officialVersionCache.networkStatus
            : probe.networkStatus,
      };
    })
    .finally(() => {
      officialVersionCache.inFlight = null;
    });

  return officialVersionCache.inFlight;
}

export async function readOfficialArkBuildCached(force = false): Promise<string | null> {
  const now = Date.now();
  if (!force && now - officialBuildCache.checkedAt < OFFICIAL_VERSION_TTL_MS) {
    return officialBuildCache.value;
  }

  if (officialBuildCache.inFlight !== null) {
    return officialBuildCache.inFlight;
  }

  officialBuildCache.inFlight = fetchOfficialArkBuild()
    .then((value) => {
      officialBuildCache.value = value;
      officialBuildCache.checkedAt = Date.now();
      return value;
    })
    .finally(() => {
      officialBuildCache.inFlight = null;
    });

  return officialBuildCache.inFlight;
}

const INSTALL_INSPECT_TTL_MS = 20_000;

const installInspectCache = new Map<
  string,
  { checkedAt: number; info: ServerInstallationInfo }
>();

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
  const steamBuild = ready
    ? (readSteamBuildFromLocalManifest(installDir) ??
      readBuildIdFromManifest(installDir))
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

  return {
    serverId,
    ...healthFields,
    build,
    steamBuild,
    arkVersion,
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
 * Classification uses `fs.promises` so slow/unavailable UNC paths do not block IPC.
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
  const info = buildInspectedInstallation(serverId, installDir, classified, options);
  writeInstallInspectCache(serverId, installDir, info);
  return info;
}
