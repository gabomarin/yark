import type { IniFileKey } from "@shared/types";
import { settingsMetaForFile, type IniSettingInput } from "@shared/ini/ini-setting-meta";
import { isVisuallyEditableIniSetting } from "@shared/ini/ini-setting-decisions";
import { isGameIniEngramEditorKey } from "./configurationEditorModel";

export interface AddableIniSetting {
  key: string;
  description: string;
  defaultValue: string;
  input: IniSettingInput;
}

const EMPTY_KEYS: ReadonlySet<string> = new Set();

export function keysInSectionOrEmpty(
  keysInSection: ReadonlyMap<string, ReadonlySet<string>>,
  section: string,
): ReadonlySet<string> {
  return keysInSection.get(section.toLowerCase()) ?? EMPTY_KEYS;
}

/** Documented settings for this file and section that the operator's INI does not list yet. */
export function addableIniSettingsForSection(
  fileKey: IniFileKey,
  section: string,
  presentKeys: ReadonlySet<string>,
): AddableIniSetting[] {
  const sectionLower = section.trim().toLowerCase();
  const choices: AddableIniSetting[] = [];
  for (const setting of settingsMetaForFile(fileKey)) {
    if (setting.section.trim().toLowerCase() !== sectionLower) continue;
    if (presentKeys.has(setting.key.toLowerCase())) continue;
    if (!isVisuallyEditableIniSetting(fileKey, setting.section, setting.key)) continue;
    if (isGameIniEngramEditorKey(fileKey, setting.key)) continue;
    choices.push({
      key: setting.key,
      description: setting.description,
      defaultValue: setting.defaultValue,
      input: setting.input,
    });
  }
  choices.sort((a, b) => a.key.localeCompare(b.key));
  return choices;
}

export function iniSettingKeyError(key: string, presentKeys: ReadonlySet<string>): string | null {
  const trimmed = key.trim();
  if (trimmed.length === 0) return "Enter a setting name.";
  if (/[\[\]=\r\n]/.test(trimmed)) return "Setting names cannot include = or brackets.";
  if (presentKeys.has(trimmed.toLowerCase())) return "This section already has that setting.";
  return null;
}

const PREFERRED_INI_SECTIONS = [
  "serversettings",
  "sessionsettings",
  "messageoftheday",
  "/script/engine.gamesession",
  "/script/shootergame.shootergamemode",
];

/** Catalog sections for this file, plus sections already in the INI (mods included). */
export function iniSectionsForNewSetting(fileKey: IniFileKey, presentSections: readonly string[]): string[] {
  const byLower = new Map<string, string>();
  const add = (section: string): void => {
    const trimmed = section.trim();
    if (trimmed.length === 0 || trimmed === "(root)") return;
    const key = trimmed.toLowerCase();
    if (!byLower.has(key)) byLower.set(key, trimmed);
  };
  for (const setting of settingsMetaForFile(fileKey)) add(setting.section);
  for (const section of presentSections) add(section);
  return [...byLower.values()].sort((a, b) => {
    const aRank = PREFERRED_INI_SECTIONS.indexOf(a.toLowerCase());
    const bRank = PREFERRED_INI_SECTIONS.indexOf(b.toLowerCase());
    if (aRank !== -1 || bRank !== -1) return (aRank === -1 ? 99 : aRank) - (bRank === -1 ? 99 : bRank);
    return a.localeCompare(b);
  });
}

export function defaultIniSection(fileKey: IniFileKey, sections: readonly string[]): string {
  const preferred = fileKey === "game" ? ["ShooterGameMode", "ServerSettings"] : ["ServerSettings", "SessionSettings"];
  for (const name of preferred) {
    const hit = sections.find(
      (section) =>
        section.toLowerCase() === name.toLowerCase() || section.toLowerCase().endsWith(`.${name.toLowerCase()}`),
    );
    if (hit !== undefined) return hit;
  }
  return sections[0] ?? "ServerSettings";
}

/** Match a known section, or keep a typed mod section. Surrounding brackets are dropped. */
export function canonicalIniSection(raw: string, known: readonly string[]): string {
  let trimmed = raw.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]") && trimmed.length > 2) {
    trimmed = trimmed.slice(1, -1).trim();
  }
  const hit = known.find((section) => section.toLowerCase() === trimmed.toLowerCase());
  return hit ?? trimmed;
}

export function iniSectionError(section: string): string | null {
  if (section.length === 0) return "Enter a section name.";
  if (/[[\]\r\n]/.test(section)) return "Section names cannot include brackets.";
  return null;
}

export function canonicalIniSettingKey(key: string, choices: readonly AddableIniSetting[]): string {
  const trimmed = key.trim();
  const hit = choices.find((choice) => choice.key.toLowerCase() === trimmed.toLowerCase());
  return hit?.key ?? trimmed;
}
