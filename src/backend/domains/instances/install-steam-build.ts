import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/** ASA dedicated server Steam AppID. */
export const ASA_APP_ID = "2430930";

/** Collapse path separators for stable Windows install-dir comparisons/cache keys. */
export function normalizePath(value: string): string {
  return value.trim().replace(/[\\/]+/g, "\\");
}

/** Nearby roots only (install ancestors + SteamCMD env) — no drive-letter storm. */
function collectNearbyManifestRoots(installDir: string): string[] {
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
  return roots;
}

function collectDriveManifestRoots(): string[] {
  const roots: string[] = [];
  for (const drive of "CDEFGHIJKLMNOPQRSTUVWXYZ") {
    roots.push(`${drive}:\\steamcmd`);
    roots.push(`${drive}:\\SteamCMD`);
    roots.push(`${drive}:\\tools\\steamcmd`);
  }
  return roots;
}

/** Full root list for sync inspect/tests (includes drive letters). */
function collectManifestRoots(installDir: string): string[] {
  const nearby = collectNearbyManifestRoots(installDir);
  const seen = new Set(nearby.map((root) => root.toLowerCase()));
  const roots = [...nearby];
  for (const root of collectDriveManifestRoots()) {
    const key = root.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    roots.push(root);
  }
  return roots;
}

function parseBuildIdFromManifestContent(
  content: string,
  installDirNormalized: string,
  installDirLeaf: string | undefined,
  fallbackBuildIds: Set<string>,
): string | null {
  const buildMatch = content.match(/"buildid"\s+"([^"]+)"/i);
  const installMatch = content.match(/"installdir"\s+"([^"]+)"/i);
  const buildId = buildMatch?.[1]?.trim() ?? "";
  const manifestInstallDir =
    installMatch?.[1]?.trim().replace(/[\\/]+/g, "\\").toLowerCase() ?? "";

  if (buildId.length === 0 || manifestInstallDir.length === 0) {
    return null;
  }

  const manifestLeaf = manifestInstallDir
    .split("\\")
    .filter((part) => part.length > 0)
    .at(-1);

  const matchesInstallDir =
    manifestInstallDir === installDirNormalized
    || installDirNormalized.endsWith(`\\${manifestInstallDir}`)
    || (installDirLeaf !== undefined
      && manifestLeaf !== undefined
      && installDirLeaf === manifestLeaf);

  if (matchesInstallDir) {
    return `build ${buildId}`;
  }

  fallbackBuildIds.add(buildId);
  return null;
}

export function readSteamBuildFromLocalManifest(installDir: string): string | null {
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

export async function readSteamBuildFromLocalManifestAsync(
  installDir: string,
): Promise<string | null> {
  const manifestPath = join(installDir, "steamapps", `appmanifest_${ASA_APP_ID}.acf`);
  try {
    const content = await readFile(manifestPath, "utf8");
    const buildId = content.match(/"buildid"\s+"([^"]+)"/i)?.[1]?.trim() ?? "";
    return buildId.length > 0 ? `build ${buildId}` : null;
  } catch {
    return null;
  }
}

export function readBuildIdFromManifest(installDir: string): string | null {
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
      const matched = parseBuildIdFromManifestContent(
        content,
        installDirNormalized,
        installDirLeaf,
        fallbackBuildIds,
      );
      if (matched !== null) {
        return matched;
      }
    } catch {
      // Best effort: skip unreadable manifest.
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

async function readBuildIdFromManifestRootsAsync(
  roots: string[],
  installDirNormalized: string,
  installDirLeaf: string | undefined,
  fallbackBuildIds: Set<string>,
): Promise<string | null> {
  for (const root of roots) {
    const manifestPath = join(root, "steamapps", `appmanifest_${ASA_APP_ID}.acf`);
    try {
      const content = await readFile(manifestPath, "utf8");
      const matched = parseBuildIdFromManifestContent(
        content,
        installDirNormalized,
        installDirLeaf,
        fallbackBuildIds,
      );
      if (matched !== null) {
        return matched;
      }
    } catch {
      // Missing or unreadable — try next root.
    }
  }
  return null;
}

export async function readBuildIdFromManifestAsync(
  installDir: string,
): Promise<string | null> {
  const installDirNormalized = normalizePath(installDir).toLowerCase();
  const installDirLeaf = installDirNormalized
    .split("\\")
    .filter((part) => part.length > 0)
    .at(-1);
  const fallbackBuildIds = new Set<string>();

  // Prefer nearby roots; widen to drive letters only when nothing matched.
  const nearbyHit = await readBuildIdFromManifestRootsAsync(
    collectNearbyManifestRoots(installDir),
    installDirNormalized,
    installDirLeaf,
    fallbackBuildIds,
  );
  if (nearbyHit !== null) {
    return nearbyHit;
  }

  const driveHit = await readBuildIdFromManifestRootsAsync(
    collectDriveManifestRoots(),
    installDirNormalized,
    installDirLeaf,
    fallbackBuildIds,
  );
  if (driveHit !== null) {
    return driveHit;
  }

  if (fallbackBuildIds.size === 1) {
    const onlyBuildId = [...fallbackBuildIds][0];
    if (onlyBuildId !== undefined && onlyBuildId.length > 0) {
      return `build ${onlyBuildId}`;
    }
  }

  return null;
}
