import meta from "./ini-setting-meta.json";

export type IniMetaFileKey = "gameUserSettings" | "game";

export type IniSettingInput =
  | { type: "boolean" }
  | { type: "text"; multiline?: boolean }
  | {
      type: "number";
      min?: number;
      max?: number;
      step?: number;
      integer?: boolean;
    }
  | { type: "range"; min: number; max: number; step?: number };

export interface IniSettingMeta {
  id: string;
  file: IniMetaFileKey;
  section: string;
  key: string;
  defaultValue: string;
  valueType: string | null;
  description: string;
  input: IniSettingInput;
}

interface IniSettingMetaFile {
  generatedAt: string;
  settings: IniSettingMeta[];
}

const catalog = meta as IniSettingMetaFile;

export const iniSettingMetaList: readonly IniSettingMeta[] = catalog.settings;

export const iniSettingMetaStats = {
  generatedAt: catalog.generatedAt,
  total: iniSettingMetaList.length,
  gusCount: iniSettingMetaList.filter((s) => s.file === "gameUserSettings").length,
  gameCount: iniSettingMetaList.filter((s) => s.file === "game").length,
};

function idFor(file: IniMetaFileKey, section: string, key: string): string {
  return `${file}\0${section}.${key}`.toLowerCase();
}

const byFileSectionKey = new Map<string, IniSettingMeta>();
for (const setting of iniSettingMetaList) {
  byFileSectionKey.set(idFor(setting.file, setting.section, setting.key), setting);
}

export function lookupIniSettingMeta(
  file: IniMetaFileKey,
  section: string,
  key: string,
): IniSettingMeta | undefined {
  return byFileSectionKey.get(idFor(file, section, key));
}

export function lookupIniSettingDefaultValue(
  file: IniMetaFileKey,
  section: string,
  key: string,
): string | null {
  const setting = lookupIniSettingMeta(file, section, key);
  if (!setting) return null;
  return setting.defaultValue;
}

export function lookupIniSettingDescription(
  file: IniMetaFileKey,
  section: string,
  key: string,
): string | null {
  const description = lookupIniSettingMeta(file, section, key)?.description.trim();
  return description ? description : null;
}

export function lookupIniSettingInput(
  file: IniMetaFileKey,
  section: string,
  key: string,
): IniSettingInput | null {
  return lookupIniSettingMeta(file, section, key)?.input ?? null;
}

export function settingsMetaForFile(
  file: IniMetaFileKey,
): readonly IniSettingMeta[] {
  return iniSettingMetaList.filter((setting) => setting.file === file);
}
