/**
 * Default INI text for new / reset server configs.
 *
 * Sole source of truth: `./defaults/*.ini`.
 * The ASA catalog (wiki) is used only for descriptions/types/UI, not to
 * fill or expand these defaults.
 */
import gameUserSettingsRaw from "./defaults/GameUserSettings.ini?raw";
import gameIniRaw from "./defaults/Game.ini?raw";

function normalizeIni(text: string): string {
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  return normalized.endsWith("\n") ? normalized : `${normalized}\n`;
}

export const defaultGameUserSettingsIni = normalizeIni(gameUserSettingsRaw);

export const defaultGameIni = normalizeIni(gameIniRaw);
