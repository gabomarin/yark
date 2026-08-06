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
 * Writes profile networking / auth settings into GameUserSettings.ini so they
 * do not need to appear on the dedicated-server command line.
 *
 * Keys (must stay aligned with `@shared/yark-owned-ini-keys` `profileSync`):
 * - `[ServerSettings]` RCONEnabled, RCONPort, ServerAdminPassword, ServerPassword
 * - `[SessionSettings]` SessionName, Port, QueryPort
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
