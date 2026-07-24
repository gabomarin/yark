/**
 * Default INI text for new / reset server configs.
 *
 * Única fuente de verdad: `./defaults/*.ini`.
 * El catálogo ASA (wiki) se usa solo para descripciones/tipos/UI, no para
 * rellenar ni ampliar estos defaults.
 */
import gameUserSettingsRaw from "./defaults/GameUserSettings.ini?raw";
import gameIniRaw from "./defaults/Game.ini?raw";

function normalizeIni(text: string): string {
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  return normalized.endsWith("\n") ? normalized : `${normalized}\n`;
}

export const defaultGameUserSettingsIni = normalizeIni(gameUserSettingsRaw);

export const defaultGameIni = normalizeIni(gameIniRaw);
