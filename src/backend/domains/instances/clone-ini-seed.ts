/**
 * Clone seeds Game.ini / GameUserSettings.ini from the source install, then
 * writes the new profile's ports, session name, and passwords.
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { defaultGameIni, defaultGameUserSettingsIni } from "@shared/ini-defaults";
import type { ServerProfile } from "@shared/types";
import { syncProfileSettingsToIni } from "./sync-profile-ini";

function windowsServerConfigDir(installDir: string): string {
  return join(installDir, "ShooterGame", "Saved", "Config", "WindowsServer");
}

/**
 * Copies source `Game.ini` and `GameUserSettings.ini` when present; missing
 * files get YARK defaults. Then syncs clone identity into GameUserSettings.ini.
 */
export async function seedCloneIniFiles(
  sourceInstallDir: string,
  profile: ServerProfile,
): Promise<void> {
  const sourceConfig = windowsServerConfigDir(sourceInstallDir);
  const destConfig = windowsServerConfigDir(profile.installDir);
  await mkdir(destConfig, { recursive: true });

  const files: ReadonlyArray<{ name: string; fallback: string }> = [
    { name: "GameUserSettings.ini", fallback: defaultGameUserSettingsIni },
    { name: "Game.ini", fallback: defaultGameIni },
  ];
  for (const file of files) {
    const destPath = join(destConfig, file.name);
    const sourcePath = join(sourceConfig, file.name);
    if (existsSync(sourcePath)) {
      const text = await readFile(sourcePath, "utf8");
      await writeFile(destPath, text, "utf8");
    } else if (!existsSync(destPath)) {
      await writeFile(destPath, file.fallback, "utf8");
    }
  }

  await syncProfileSettingsToIni(profile);
}
