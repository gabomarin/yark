import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { defaultGameUserSettingsIni } from "@shared/ini-defaults";
import type { ServerProfile } from "@shared/types";
import { applyProfileOwnedKeysToGameUserSettings } from "../config/ini-compose";

/** GameUserSettings.ini path under a server install. */
export function gameUserSettingsIniPath(installDir: string): string {
  return join(
    installDir,
    "ShooterGame",
    "Saved",
    "Config",
    "WindowsServer",
    "GameUserSettings.ini",
  );
}

/**
 * Low-level idle disk write of profile networking / auth into GameUserSettings.ini.
 *
 * Do **not** call this while the dedicated process may be live — ASA can clobber
 * the file. Prefer {@link applyProfileOwnedIni} / `IniService.syncProfileOwnedKeys`
 * so running servers queue into the pending INI draft (#530).
 *
 * Keys (must stay aligned with `@shared/yark-owned-ini-keys` `profileSync`):
 * - `[ServerSettings]` RCONEnabled, RCONPort, ServerAdminPassword, ServerPassword
 * - `[SessionSettings]` SessionName, Port, QueryPort
 * - Start composes `-WinLiveMaxPlayers=` when `maxPlayers` is 1–255
 *   (ASA ignores INI MaxPlayers; omitting the flag defaults to 70)
 *
 * Mods are **not** written here — ASA launches with `-mods=` from `profile.mods`
 * (CurseForge). ASE-era INI keys such as ActiveMods stay out of templates
 * (`aseLegacy` in `@shared/yark-owned-ini-keys`).
 */
export async function syncProfileSettingsToIni(
  profile: ServerProfile,
): Promise<void> {
  const path = gameUserSettingsIniPath(profile.installDir);
  const existing = existsSync(path)
    ? await readFile(path, "utf8")
    : defaultGameUserSettingsIni;
  const text = applyProfileOwnedKeysToGameUserSettings(existing, profile);

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text, "utf8");
}

/**
 * Apply profile-owned GUS keys. When `syncViaIniService` is wired (production),
 * uses the pending-queue gate while ASA is live; otherwise falls back to a
 * direct disk write (unit tests, clone seed on a stopped install).
 */
export async function applyProfileOwnedIni(
  profile: ServerProfile,
  syncViaIniService?: (
    serverId: string,
    profile?: ServerProfile,
  ) => Promise<void>,
): Promise<void> {
  if (syncViaIniService !== undefined) {
    await syncViaIniService(profile.id, profile);
    return;
  }
  await syncProfileSettingsToIni(profile);
}
