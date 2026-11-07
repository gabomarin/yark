/**
 * ASA dedicated (UE 5.8 / v97+) regenerates the whole GameUserSettings.ini when
 * `[/Script/ShooterGame.ShooterGameUserSettings]` lacks `Version=5`. Seed minimal
 * shell sections when empty and ensure that marker on Start/sync/restore.
 */

import asaDedicatedGusShellsRaw from "../defaults/asa-dedicated-gus-shells.ini?raw";
import { ASA_REQUIRED_GUS_SHELL_SECTIONS } from "./asa-gus-overrides";
import { flattenIniText, INI_FLAT_SEP, setIniTextValue } from "./ini-text";

/** Section that must carry UE5 `Version=5` or ASA regenerates the whole GUS. */
export const ASA_SHOOTER_GUS_SECTION = "/Script/ShooterGame.ShooterGameUserSettings";

/** UE 5.x GameUserSettings version marker required by ASA v97+ dedicated. */
export const ASA_SHOOTER_GUS_VERSION = "5";

/** Section headers ensured on disk (shells + GameSession). */
export const ASA_DEDICATED_GUS_SKELETON_SECTIONS = [
  ...ASA_REQUIRED_GUS_SHELL_SECTIONS,
  "/Script/Engine.GameSession",
] as const;

const GAME_SESSION_SECTION = "/Script/Engine.GameSession";

function normalizeIni(text: string): string {
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  return normalized.endsWith("\n") ? normalized : `${normalized}\n`;
}

/** Bundled minimal shell bodies. */
export const ASA_DEDICATED_GUS_SHELL_DEFAULTS = normalizeIni(asaDedicatedGusShellsRaw);

function sectionNameFromHeader(headerLine: string): string | null {
  const match = /^\[(.+)\]\s*$/.exec(headerLine.trim());
  if (match === null) return null;
  return (match[1] ?? "").trim();
}

function sectionBodyHasAssignment(body: string): boolean {
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith(";") || trimmed.startsWith("#") || trimmed.startsWith("[")) {
      continue;
    }
    if (trimmed.includes("=")) {
      return true;
    }
  }
  return false;
}

function splitIniSectionBlocks(text: string): {
  preamble: string;
  blocks: Array<{ name: string; body: string }>;
} {
  const lines = text.split(/\r?\n/);
  const preambleLines: string[] = [];
  const blocks: Array<{ name: string; body: string }> = [];
  let currentName: string | null = null;
  let currentLines: string[] = [];

  const flush = (): void => {
    if (currentName === null) return;
    blocks.push({ name: currentName, body: currentLines.join("\n") });
    currentName = null;
    currentLines = [];
  };

  for (const line of lines) {
    const name = sectionNameFromHeader(line);
    if (name !== null) {
      flush();
      currentName = name;
      currentLines = [line];
      continue;
    }
    if (currentName === null) {
      preambleLines.push(line);
    } else {
      currentLines.push(line);
    }
  }
  flush();

  return { preamble: preambleLines.join("\n"), blocks };
}

function mergeShellBlocks(baseGus: string, overrideBlocks: Array<{ name: string; body: string }>): string {
  if (overrideBlocks.length === 0) {
    return baseGus;
  }
  const { preamble, blocks } = splitIniSectionBlocks(baseGus);
  const byLower = new Map(overrideBlocks.map((b) => [b.name.toLowerCase(), b] as const));
  const used = new Set<string>();
  const next: Array<{ name: string; body: string }> = [];

  for (const block of blocks) {
    const key = block.name.toLowerCase();
    const replacement = byLower.get(key);
    if (replacement !== undefined) {
      next.push(replacement);
      used.add(key);
    } else {
      next.push(block);
    }
  }
  for (const section of ASA_REQUIRED_GUS_SHELL_SECTIONS) {
    const key = section.toLowerCase();
    if (used.has(key)) continue;
    const missing = byLower.get(key);
    if (missing !== undefined) {
      next.push(missing);
    }
  }

  const parts: string[] = [];
  const trimmedPreamble = preamble.replace(/\n+$/, "");
  if (trimmedPreamble.trim().length > 0) {
    parts.push(trimmedPreamble);
  }
  for (const block of next) {
    parts.push(block.body.replace(/\n+$/, ""));
  }
  let out = parts.join("\n\n");
  if (out.length > 0 && !out.endsWith("\n")) {
    out += "\n";
  }
  return out;
}

/** True when `[section]` appears as a header (case-insensitive). */
export function hasIniSectionHeader(text: string, section: string): boolean {
  const wanted = section.trim().toLowerCase();
  if (wanted.length === 0) return false;
  for (const raw of text.split(/\r?\n/)) {
    const match = /^\[(.+)\]\s*$/.exec(raw.trim());
    if (match !== null && (match[1] ?? "").trim().toLowerCase() === wanted) {
      return true;
    }
  }
  return false;
}

function appendEmptySectionHeader(text: string, section: string): string {
  let out = text;
  if (out.length > 0 && !out.endsWith("\n")) {
    out += "\n";
  }
  if (out.length > 0 && !out.endsWith("\n\n")) {
    out += "\n";
  }
  return `${out}[${section}]\n`;
}

function flatLookup(flat: Record<string, string>, section: string, key: string): string | undefined {
  const exact = flat[`${section}${INI_FLAT_SEP}${key}`];
  if (exact !== undefined) {
    return exact;
  }
  const sectionLower = section.toLowerCase();
  const keyLower = key.toLowerCase();
  for (const [flatKey, value] of Object.entries(flat)) {
    const sep = flatKey.indexOf(INI_FLAT_SEP);
    if (sep < 0) continue;
    if (
      flatKey.slice(0, sep).toLowerCase() === sectionLower &&
      flatKey.slice(sep + INI_FLAT_SEP.length).toLowerCase() === keyLower
    ) {
      return value;
    }
  }
  return undefined;
}

/**
 * Ensures `Version=5` under `[/Script/ShooterGame.ShooterGameUserSettings]`.
 * Adds the key (and section if needed) only when missing.
 */
export function ensureAsaShooterGameUserSettingsVersion(gameUserSettings: string): string {
  const flat = flattenIniText(gameUserSettings);
  if (flatLookup(flat, ASA_SHOOTER_GUS_SECTION, "Version") !== undefined) {
    return gameUserSettings;
  }
  return setIniTextValue(gameUserSettings, ASA_SHOOTER_GUS_SECTION, "Version", ASA_SHOOTER_GUS_VERSION);
}

/**
 * Seeds empty/missing UE client shell sections from bundled defaults, then
 * ensures `Version=5` on ShooterGameUserSettings.
 */
export function ensureAsaGameUserSettingsSkeleton(gameUserSettings: string): string {
  let text = gameUserSettings;
  const { blocks } = splitIniSectionBlocks(text);
  const byLower = new Map(blocks.map((b) => [b.name.toLowerCase(), b] as const));
  const defaultBlocks = splitIniSectionBlocks(ASA_DEDICATED_GUS_SHELL_DEFAULTS).blocks;

  const seedParts: Array<{ name: string; body: string }> = [];
  for (const section of ASA_REQUIRED_GUS_SHELL_SECTIONS) {
    const existing = byLower.get(section.toLowerCase());
    if (existing !== undefined && sectionBodyHasAssignment(existing.body)) {
      continue;
    }
    const defaults = defaultBlocks.find((b) => b.name.toLowerCase() === section.toLowerCase());
    if (defaults !== undefined) {
      seedParts.push({ name: defaults.name, body: defaults.body.replace(/\n+$/, "") });
    }
  }

  if (seedParts.length > 0) {
    text = mergeShellBlocks(text, seedParts);
  }

  if (!hasIniSectionHeader(text, GAME_SESSION_SECTION)) {
    text = appendEmptySectionHeader(text, GAME_SESSION_SECTION);
  }

  return ensureAsaShooterGameUserSettingsVersion(text);
}
