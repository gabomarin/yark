/**
 * Compatibility facade over ini-setting-meta (defaults-derived).
 * Prefer `@shared/ini-setting-meta` for new code.
 */
import {
  iniSettingMetaList,
  iniSettingMetaStats,
  lookupIniSettingDefaultValue,
  lookupIniSettingDescription,
  lookupIniSettingMeta,
  settingsMetaForFile,
  type IniMetaFileKey,
  type IniSettingMeta,
} from "./ini-setting-meta";

export type AsaIniFileKey = IniMetaFileKey;

export interface AsaServerSetting {
  section: string;
  key: string;
  defaultValue: string;
  description: string;
  file: AsaIniFileKey;
  asa: true;
  server: true;
  valueType?: string;
}

function toAsaSetting(setting: IniSettingMeta): AsaServerSetting {
  return {
    section: setting.section,
    key: setting.key,
    defaultValue: setting.defaultValue,
    description: setting.description,
    file: setting.file,
    asa: true,
    server: true,
    valueType: setting.valueType ?? undefined,
  };
}

export const asaServerSettings: readonly AsaServerSetting[] =
  iniSettingMetaList.map(toAsaSetting);

export const asaServerSettingsMeta = {
  gusCount: iniSettingMetaStats.gusCount,
  gameCount: iniSettingMetaStats.gameCount,
  fromUserIni: iniSettingMetaStats.total,
  wikiOnly: 0,
};

export function settingId(section: string, key: string): string {
  return `${section}.${key}`.toLowerCase();
}

export function lookupAsaSetting(
  file: AsaIniFileKey,
  section: string,
  key: string,
): AsaServerSetting | undefined {
  const hit = lookupIniSettingMeta(file, section, key);
  return hit ? toAsaSetting(hit) : undefined;
}

export function lookupAsaDefaultValue(
  file: AsaIniFileKey,
  section: string,
  key: string,
): string | null {
  return lookupIniSettingDefaultValue(file, section, key);
}

export function lookupAsaDescription(
  file: AsaIniFileKey,
  section: string,
  key: string,
): string | null {
  return lookupIniSettingDescription(file, section, key);
}

export function settingsForFile(file: AsaIniFileKey): readonly AsaServerSetting[] {
  return settingsMetaForFile(file).map(toAsaSetting);
}

/**
 * @deprecated Runtime defaults come from `src/shared/defaults/*.ini` via ini-defaults.
 * Kept for tests/tooling smoke checks only.
 */
export function buildDefaultIniText(file: AsaIniFileKey): string {
  const settings = settingsForFile(file);
  const sections: string[] = [];
  const bySection = new Map<string, AsaServerSetting[]>();

  for (const setting of settings) {
    let list = bySection.get(setting.section);
    if (!list) {
      list = [];
      bySection.set(setting.section, list);
      sections.push(setting.section);
    }
    list.push(setting);
  }

  const lines: string[] = [];
  for (const section of sections) {
    const entries = bySection.get(section) ?? [];
    if (entries.length === 0) continue;
    if (lines.length > 0) lines.push("");
    lines.push(`[${section}]`);
    for (const setting of entries) {
      lines.push(`${setting.key}=${setting.defaultValue}`);
    }
  }

  return `${lines.join("\n")}\n`;
}
