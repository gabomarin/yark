/**
 * Default INI text for new / reset server configs.
 *
 * Source of truth: the commented templates in `./defaults/*.ini`.
 * Missing ASA server keys from the wiki catalog are appended on top of those files.
 */
import gameUserSettingsRaw from "./defaults/GameUserSettings.ini?raw";
import gameIniRaw from "./defaults/Game.ini?raw";
import { mergeMissingCatalogDefaults } from "./asa-server-settings";

function normalizeIni(text: string): string {
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  return normalized.endsWith("\n") ? normalized : `${normalized}\n`;
}

export const defaultGameUserSettingsIni = mergeMissingCatalogDefaults(
  "gameUserSettings",
  normalizeIni(gameUserSettingsRaw),
);

export const defaultGameIni = mergeMissingCatalogDefaults(
  "game",
  normalizeIni(gameIniRaw),
);
