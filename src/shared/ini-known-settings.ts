import { asaServerSettings, type AsaIniFileKey } from "./asa-server-settings";

export interface KnownIniSetting {
  section: string;
  key: string;
}

function knownKeysForFile(file: AsaIniFileKey): KnownIniSetting[] {
  return asaServerSettings
    .filter((setting) => setting.file === file)
    .map((setting) => ({
      section: setting.section.toLowerCase(),
      key: setting.key.toLowerCase(),
    }));
}

export const knownGameUserSettingsKeys = knownKeysForFile("gameUserSettings");

export const knownGameIniKeys = knownKeysForFile("game");

export function knownSettingLookup(settings: readonly KnownIniSetting[]): Set<string> {
  return new Set(settings.map((item) => `${item.section}.${item.key}`.toLowerCase()));
}
