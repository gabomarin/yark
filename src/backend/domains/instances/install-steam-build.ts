import { existsSync, readFileSync, statSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

/** ASA dedicated server Steam AppID. */
export const ASA_APP_ID = "2430930";

/** Collapse path separators for stable Windows install-dir comparisons/cache keys. */
export function normalizePath(value: string): string {
  return value.trim().replace(/[\\/]+/g, "\\");
}

/**
 * Local Steam build for update compare — install-dir appmanifest only.
 * Shared SteamCMD / content-cache manifests must not decide fleet "current"
 * (#490); missing local manifest → null → update state `unknown`.
 */
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

/** mtime of the install-dir ASA appmanifest, or null when missing/unreadable. */
export function readLocalSteamManifestMtimeMs(installDir: string): number | null {
  const manifestPath = join(installDir, "steamapps", `appmanifest_${ASA_APP_ID}.acf`);
  try {
    if (!existsSync(manifestPath)) return null;
    return statSync(manifestPath).mtimeMs;
  } catch {
    return null;
  }
}

export async function readLocalSteamManifestMtimeMsAsync(
  installDir: string,
): Promise<number | null> {
  const manifestPath = join(installDir, "steamapps", `appmanifest_${ASA_APP_ID}.acf`);
  try {
    return (await stat(manifestPath)).mtimeMs;
  } catch {
    return null;
  }
}
