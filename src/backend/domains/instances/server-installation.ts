import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { get } from "node:https";
import { dirname, join } from "node:path";
import { serverBinaryPath } from "./launch-args";
import type { ServerInstallationInfo } from "@shared/types";

const ASA_APP_ID = "2430930";
const OFFICIAL_VERSION_TTL_MS = 15 * 60 * 1000;
const OFFICIAL_SERVER_STATUS_URL =
  "https://cdn2.arkdedicated.com/asa/officialserverstatus.ini";

let officialVersionCache: {
  value: string | null;
  checkedAt: number;
  inFlight: Promise<string | null> | null;
} = {
  value: null,
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
      // Best effort: si un archivo de versión está corrupto, se intenta la siguiente fuente.
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
    // Best effort: algunos binarios no exponen ProductVersion o PowerShell no está disponible.
    return null;
  }
}

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
      const raw = readFileSync(item.fullPath, "utf8");
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
  const match = content.match(/\(\s*v(\d+(?:\.\d+)+)\s*\)/i);
  return match?.[1] ?? null;
}

function fetchOfficialArkVersion(): Promise<string | null> {
  return new Promise((resolve) => {
    const req = get(
      OFFICIAL_SERVER_STATUS_URL,
      {
        headers: {
          accept: "text/plain, */*",
          "user-agent": "ark-server-gbo/1.0",
        },
      },
      (res) => {
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
          resolve(extractOfficialVersionFromStatusText(body));
        });
      },
    );

    req.setTimeout(3_500, () => {
      req.destroy();
      resolve(null);
    });

    req.on("error", () => {
      resolve(null);
    });
  });
}

export async function readOfficialArkVersionCached(force = false): Promise<string | null> {
  const now = Date.now();
  if (!force && now - officialVersionCache.checkedAt < OFFICIAL_VERSION_TTL_MS) {
    return officialVersionCache.value;
  }

  if (officialVersionCache.inFlight !== null) {
    return officialVersionCache.inFlight;
  }

  officialVersionCache.inFlight = fetchOfficialArkVersion()
    .then((value) => {
      officialVersionCache.value = value;
      officialVersionCache.checkedAt = Date.now();
      return value;
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

export function inspectServerInstallation(
  serverId: string,
  installDir: string,
): ServerInstallationInfo {
  const binaryPath = serverBinaryPath(installDir);
  const installed = existsSync(binaryPath);
  const steamBuild = installed ? readSteamBuildFromLocalManifest(installDir) : null;
  const build = installed
    ? (
        readVersionFromKnownFiles(installDir) ??
        readVersionFromExecutable(binaryPath) ??
        steamBuild ??
        readBuildIdFromManifest(installDir)
      )
    : null;
  const arkVersion = installed ? readArkVersionFromLogs(installDir) : null;

  return {
    serverId,
    installed,
    build,
    steamBuild,
    arkVersion,
    officialVersion: null,
    officialSteamBuild: null,
    version: build,
    binaryPath,
    checkedAt: new Date().toISOString(),
  };
}
