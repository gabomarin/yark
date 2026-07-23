import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { serverBinaryPath } from "./launch-args";
import type { ServerInstallationInfo } from "@shared/types";

const ASA_APP_ID = "2430930";

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
        `$v=(Get-Item -LiteralPath '${escapedPath}').VersionInfo.ProductVersion; if($v){$v}`,
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

function readBuildIdFromManifest(installDir: string): string | null {
  const installDirNormalized = normalizePath(installDir).toLowerCase();
  const installDirLeaf = installDirNormalized
    .split("\\")
    .filter((part) => part.length > 0)
    .at(-1);

  const roots = collectManifestRoots(installDir);

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
    } catch {
      // Best effort: omite manifest ilegible.
    }
  }

  return null;
}

export function inspectServerInstallation(
  serverId: string,
  installDir: string,
): ServerInstallationInfo {
  const binaryPath = serverBinaryPath(installDir);
  const installed = existsSync(binaryPath);
  const version = installed
    ? (
        readVersionFromKnownFiles(installDir) ??
        readVersionFromExecutable(binaryPath) ??
        readBuildIdFromManifest(installDir)
      )
    : null;

  return {
    serverId,
    installed,
    version,
    binaryPath,
    checkedAt: new Date().toISOString(),
  };
}
