import catalog from "./asa-server-settings-data.json";
import { parseIniTextRows } from "./ini-text";

export type AsaIniFileKey = "gameUserSettings" | "game";

export interface AsaServerSetting {
  section: string;
  key: string;
  defaultValue: string;
  description: string;
  file: AsaIniFileKey;
  asa: true;
  server: true;
  source?: "userIni" | "wiki" | "both";
  category?: string;
  valueType?: string;
}

const EMPTY_DEFAULT_ALLOWLIST = new Set([
  "ActiveMods",
  "ActiveMapMod",
  "Message",
  "ServerAdminPassword",
  "ServerPassword",
  "SessionName",
  "CosmeticWhitelistOverride",
  "CustomLiveTuningUrl",
  "BanListURL",
  "BadWordListURL",
  "BadWordWhiteListURL",
]);

function isCommandLineOnlySetting(setting: AsaServerSetting): boolean {
  const key = setting.key.trim();
  if (key.startsWith("-") || key.startsWith("?")) return true;
  const category = setting.category?.trim() ?? "";
  if (/^command line options$/i.test(category)) return true;
  return false;
}

export const asaServerSettings: readonly AsaServerSetting[] = (
  catalog.settings as AsaServerSetting[]
).filter((setting) => !isCommandLineOnlySetting(setting));

export const asaServerSettingsMeta: {
  gusCount: number;
  gameCount: number;
  fromUserIni: number;
  wikiOnly: number;
} = {
  gusCount: asaServerSettings.filter((s) => s.file === "gameUserSettings").length,
  gameCount: asaServerSettings.filter((s) => s.file === "game").length,
  fromUserIni: asaServerSettings.filter(
    (s) => s.source === "userIni" || s.source === "both",
  ).length,
  wikiOnly: asaServerSettings.filter((s) => s.source === "wiki").length,
};

export function settingId(section: string, key: string): string {
  return `${section}.${key}`.toLowerCase();
}

function idFor(file: AsaIniFileKey, section: string, key: string): string {
  return `${file}\0${settingId(section, key)}`;
}

const byFileSectionKey = new Map<string, AsaServerSetting>();
for (const setting of asaServerSettings) {
  byFileSectionKey.set(idFor(setting.file, setting.section, setting.key), setting);
}

export function lookupAsaSetting(
  file: AsaIniFileKey,
  section: string,
  key: string,
): AsaServerSetting | undefined {
  return byFileSectionKey.get(idFor(file, section, key));
}

export function lookupAsaDefaultValue(
  file: AsaIniFileKey,
  section: string,
  key: string,
): string | null {
  const setting = lookupAsaSetting(file, section, key);
  if (!setting) return null;
  const resolved = resolveEmitDefault(setting);
  return resolved === undefined ? null : resolved;
}

export function lookupAsaDescription(
  file: AsaIniFileKey,
  section: string,
  key: string,
): string | null {
  const setting = lookupAsaSetting(file, section, key);
  const description = setting?.description?.trim();
  return description ? description : null;
}

export function settingsForFile(file: AsaIniFileKey): readonly AsaServerSetting[] {
  return asaServerSettings.filter((setting) => setting.file === file);
}

/** True when defaultValue is wiki/template noise and should not be emitted. */
function isUnusableDefaultValue(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.startsWith("&nbsp;")) return true;
  if (/=N\/A$/i.test(trimmed) || trimmed === "N/A" || trimmed.toLowerCase() === "n/a") {
    return true;
  }
  // Malformed wiki cells like `: "http://..."`
  if (/^:\s*"/.test(trimmed)) return true;
  // Template placeholders without a concrete scalar
  if (/<(string|float|integer|attribute|stat_id|type)[^>]*>/i.test(trimmed)) {
    return true;
  }
  return false;
}

function hasIndexedKeyName(key: string): boolean {
  return key.includes("[") && key.includes("]");
}

function isConcreteNumericDefault(value: string): boolean {
  return /^-?\d+(\.\d+)?$/.test(value.trim());
}

/**
 * Returns the value to emit for defaults INI, or undefined to skip the key.
 */
function resolveEmitDefault(setting: AsaServerSetting): string | undefined {
  const raw = setting.defaultValue ?? "";
  const trimmed = raw.trim();

  if (hasIndexedKeyName(setting.key) && !isConcreteNumericDefault(trimmed)) {
    return undefined;
  }

  if (trimmed.length === 0) {
    if (EMPTY_DEFAULT_ALLOWLIST.has(setting.key) || /^ActiveMods/i.test(setting.key)) {
      return "";
    }
    return undefined;
  }

  if (isUnusableDefaultValue(trimmed)) {
    if (EMPTY_DEFAULT_ALLOWLIST.has(setting.key) || /^ActiveMods/i.test(setting.key)) {
      return "";
    }
    return undefined;
  }

  return raw;
}

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
    const emitted: string[] = [];
    for (const setting of entries) {
      const value = resolveEmitDefault(setting);
      if (value === undefined) continue;
      emitted.push(`${setting.key}=${value}`);
    }
    if (emitted.length === 0) continue;
    if (lines.length > 0) lines.push("");
    lines.push(`[${section}]`);
    lines.push(...emitted);
  }

  return `${lines.join("\n")}\n`;
}

/**
 * Keeps the user INI file as the body of defaults, then appends catalog keys
 * that are missing (usable defaults only).
 */
export function mergeMissingCatalogDefaults(
  file: AsaIniFileKey,
  baseIniText: string,
): string {
  const existing = new Set(
    parseIniTextRows(baseIniText).map(
      (row) => `${row.section.toLowerCase()}\0${row.key.toLowerCase()}`,
    ),
  );

  const missingBySection = new Map<string, Array<{ key: string; value: string; description: string }>>();

  for (const setting of settingsForFile(file)) {
    const id = `${setting.section.toLowerCase()}\0${setting.key.toLowerCase()}`;
    if (existing.has(id)) continue;
    const value = resolveEmitDefault(setting);
    if (value === undefined) continue;
    const list = missingBySection.get(setting.section) ?? [];
    list.push({
      key: setting.key,
      value,
      description: setting.description.trim(),
    });
    missingBySection.set(setting.section, list);
  }

  if (missingBySection.size === 0) {
    return baseIniText.endsWith("\n") ? baseIniText : `${baseIniText}\n`;
  }

  // Prefer appending into existing sections when the header already exists.
  const sectionHeaderRe = /^\[(.+)\]\s*$/i;
  const lines = baseIniText.replace(/\r\n/g, "\n").split("\n");
  const pending = new Map(missingBySection);
  const output: string[] = [];
  let currentSection: string | null = null;

  const flushCurrentSectionExtras = () => {
    if (currentSection === null) return;
    const extras = pending.get(currentSection);
    if (!extras || extras.length === 0) return;
    if (output.length > 0 && output[output.length - 1]?.trim() !== "") {
      output.push("");
    }
    output.push("# --- ASA catalog additions (missing from base defaults) ---");
    for (const item of extras) {
      if (item.description.length > 0) {
        output.push(`# ${item.description}`);
      }
      output.push(`${item.key}=${item.value}`);
    }
    pending.delete(currentSection);
  };

  for (const line of lines) {
    const match = sectionHeaderRe.exec(line.trim());
    if (match) {
      flushCurrentSectionExtras();
      currentSection = match[1] ?? null;
      // Normalize map key to the catalog section casing if we have pending under another case
      if (currentSection !== null) {
        for (const sectionName of pending.keys()) {
          if (sectionName.toLowerCase() === currentSection.toLowerCase()) {
            currentSection = sectionName;
            break;
          }
        }
      }
      output.push(line);
      continue;
    }
    output.push(line);
  }
  flushCurrentSectionExtras();

  // Sections that did not exist in the base file.
  for (const [section, extras] of pending) {
    if (extras.length === 0) continue;
    if (output.length > 0 && output[output.length - 1]?.trim() !== "") {
      output.push("");
    }
    output.push(`[${section}]`);
    output.push("# --- ASA catalog additions (missing from base defaults) ---");
    for (const item of extras) {
      if (item.description.length > 0) {
        output.push(`# ${item.description}`);
      }
      output.push(`${item.key}=${item.value}`);
    }
  }

  let out = output.join("\n");
  if (!out.endsWith("\n")) out += "\n";
  return out;
}
