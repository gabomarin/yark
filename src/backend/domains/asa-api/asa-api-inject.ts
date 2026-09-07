import { existsSync, renameSync, rmSync } from "node:fs";
import {
  asaApiVersionDllDisabledPath,
  asaApiVersionDllPath,
} from "./asa-api-paths";

export type AsaApiInjectMode = "off" | "versionDll" | "loader";

/** Resolve on-disk inject mode from profile flags (#243). */
export function resolveAsaApiInjectMode(profile: {
  useAsaApi?: boolean;
  useAsaApiLoader?: boolean;
}): AsaApiInjectMode {
  if (profile.useAsaApi !== true) return "off";
  if (profile.useAsaApiLoader === true) return "loader";
  return "versionDll";
}

/**
 * Keep Version.dll mutually exclusive with AsaApiLoader starts.
 * Official AsaApiLoader release notes: do not leave Version.dll active when
 * using AsaApiLoader.exe.
 */
export function syncAsaApiVersionDll(
  installDir: string,
  mode: AsaApiInjectMode,
): void {
  const active = asaApiVersionDllPath(installDir);
  const disabled = asaApiVersionDllDisabledPath(installDir);

  if (mode === "versionDll") {
    if (existsSync(active)) return;
    if (existsSync(disabled)) {
      renameSync(disabled, active);
      return;
    }
    throw new Error(
      `version.dll was not found at ${active}. Install AsaApi from the AsaApi tab (includes the Version.dll loader).`,
    );
  }

  // off or loader — side-load must not fire when starting ArkAscendedServer.exe
  if (!existsSync(active)) return;
  if (existsSync(disabled)) {
    rmSync(active, { force: true });
    return;
  }
  renameSync(active, disabled);
}

/** Sync Version.dll from profile Load-on-Start / loader flags (#243). */
export function syncAsaApiVersionDllForProfile(
  installDir: string,
  profile: { useAsaApi?: boolean; useAsaApiLoader?: boolean },
): void {
  syncAsaApiVersionDll(installDir, resolveAsaApiInjectMode(profile));
}
