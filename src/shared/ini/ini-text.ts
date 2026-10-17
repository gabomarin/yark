/**
 * INI parser/serializer oriented to ARK ASA.
 *
 * Important: does NOT use the `ini` package for read/write, because it treats
 * dots inside headers as nesting. In ASA it is normal to have:
 *   [/Script/Engine.GameSession]
 *   MaxPlayers=70
 * and that must remain a literal section + MaxPlayers key.
 */

export interface IniTextRow {
  section: string;
  key: string;
  value: string;
}

const INI_ROOT_SECTION = "(root)";

/** Internal separator for flat section+key maps (does not appear in ASA INIs). */
export const INI_FLAT_SEP = "\u001f";

/**
 * Typical Unreal client / graphics sections.
 * They do not apply on a dedicated server and clutter the editor.
 */
function isClientIniSection(section: string): boolean {
  const s = section.trim().toLowerCase();
  if (s.length === 0 || s === INI_ROOT_SECTION) {
    return false;
  }
  if (s.includes("shootergameusersettings")) {
    return true;
  }
  if (s.includes("engine.gameusersettings")) {
    return true;
  }
  if (s === "scalabilitygroups") {
    return true;
  }
  // Flat [GameUserSettings] (resolution/window), not ServerSettings.
  if (s === "gameusersettings") {
    return true;
  }
  return false;
}

/**
 * Unreal client/graphics/UI/history keys.
 * They add nothing on a dedicated server.
 */
const CLIENT_INI_KEY_RE =
  /^(LastJoinedSessionPerCategory|LastServerSearch|LastServerSort|LastPlatform|LastRecommended|LastCPU|LastGPU|LastAuto|LastBrowsed|LastDLC|PlayedMaps|LocalSuperPeeker|DesiredScreen|FullscreenMode|LastConfirmed|bUseVSync|AudioQualityLevel|bUseMouse|bUseGamepad|MouseSensitivity|MasterVolume|MusicVolume|SFXVolume|UIVolume|VoiceVolume|ResolutionSize[XY]|WindowPos[XY]|ScreenPercentage|FrameRateLimit|GraphicsQuality|AdvancedGraphicsQuality|TrueSkyQuality|GroundClutter|LODScalar|Gamma|TheGamma|HDRDisplay|EnableDLSS|SuperResolution|FrameGeneration|ReflexEnabled|sg\.|bDisableBloom|bDisableShadows|bFilmGrain|bUseSSAO|bUseDFAO|bEnableHDR|bUseHDR|bEnableReflex|bEnableDLFG|bLowQualityVFX|bHighQuality|bDistanceField|bExtraLevelStreaming|bUseDynamicResolution|bUseLowQuality|bDontReduceGameResolution|bHasInitializedScreen|bHasSetupVisual|bHasRunAutoSettings|bUseDesiredScreenHeight|MasterAudioVolume|MusicAudioVolume|SFXAudioVolume|VoiceAudioVolume|AmbientSoundVolume|CharacterAudioVolume|SoundUIAudioVolume|LookLeftRightSensitivity|LookUpDownSensitivity|CameraShakeScale|EmoteKeyBind|UIScaling|UIQuickbarScaling)/i;

export function isClientIniKey(key: string): boolean {
  const k = key.trim();
  if (CLIENT_INI_KEY_RE.test(k)) {
    return true;
  }
  // Unreal scalability prefix
  if (/^sg\./i.test(k)) {
    return true;
  }
  return false;
}

/** True if the row should not be shown/persisted in the dedicated manager. */
export function isClientIniNoise(section: string, key: string): boolean {
  if (isClientIniSection(section)) {
    return true;
  }
  if (isClientIniKey(key)) {
    return true;
  }
  // [Startup] often mixes client upscaling/frame-gen flags.
  const s = section.trim().toLowerCase();
  if (s === "startup") {
    const k = key.toLowerCase();
    if (/dlss|fsr|xess|reflex|framegeneration|superresolution|graphics|resolution|vsync|hdr/.test(k)) {
      return true;
    }
  }
  return false;
}

/**
 * Removes client lines/sections, preserving the rest of the file.
 * Also drops sections that become empty after cleanup.
 */
export function stripClientIniKeys(text: string): string {
  const lines = text.split(/\r?\n/);
  const kept: string[] = [];
  let sectionHeader: string | null = null;
  let sectionName = INI_ROOT_SECTION;
  let sectionBody: string[] = [];
  let sectionKeyCount = 0;
  let skipSection = false;

  const commitSection = () => {
    if (sectionHeader === null) {
      return;
    }
    if (!skipSection && sectionKeyCount > 0) {
      kept.push(sectionHeader, ...sectionBody);
    }
    sectionHeader = null;
    sectionName = INI_ROOT_SECTION;
    sectionBody = [];
    sectionKeyCount = 0;
    skipSection = false;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const sectionMatch = /^\[(.+)\]$/.exec(trimmed);

    if (sectionMatch !== null) {
      commitSection();
      sectionHeader = line;
      sectionName = (sectionMatch[1] ?? "").trim();
      skipSection = isClientIniSection(sectionName);
      continue;
    }

    if (skipSection) {
      continue;
    }

    const eq = trimmed.indexOf("=");
    const isAssignment = eq > 0 && !trimmed.startsWith(";") && !trimmed.startsWith("#");

    if (isAssignment) {
      const key = trimmed.slice(0, eq).trim();
      if (isClientIniNoise(sectionName, key)) {
        continue;
      }
      if (sectionHeader !== null) {
        sectionBody.push(line);
        sectionKeyCount += 1;
      } else {
        kept.push(line);
      }
      continue;
    }

    if (sectionHeader !== null) {
      sectionBody.push(line);
    } else {
      kept.push(line);
    }
  }

  commitSection();

  let out = kept.join("\n");
  if (out.length > 0 && !out.endsWith("\n")) {
    out += "\n";
  }
  return out;
}

export function sanitizeServerIniPayload(payload: { gameUserSettings: string; game: string }): {
  gameUserSettings: string;
  game: string;
} {
  return {
    gameUserSettings: stripClientIniKeys(payload.gameUserSettings),
    game: stripClientIniKeys(payload.game),
  };
}
export function parseIniTextRows(text: string): IniTextRow[] {
  const rows: IniTextRow[] = [];
  let section = INI_ROOT_SECTION;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith(";") || line.startsWith("#")) {
      continue;
    }

    const sectionMatch = /^\[(.+)\]$/.exec(line);
    if (sectionMatch !== null) {
      section = sectionMatch[1] ?? INI_ROOT_SECTION;
      continue;
    }

    const eq = line.indexOf("=");
    if (eq <= 0) {
      continue;
    }

    const key = line.slice(0, eq).trim();
    if (key.length === 0) {
      continue;
    }

    rows.push({
      section,
      key,
      value: line.slice(eq + 1).trim(),
    });
  }

  return rows;
}

export function flattenIniText(text: string): Record<string, string> {
  const flat: Record<string, string> = {};
  for (const row of parseIniTextRows(text)) {
    flat[`${row.section}${INI_FLAT_SEP}${row.key}`] = row.value;
  }
  return flat;
}

export function splitFlatIniKey(flatKey: string): { section: string; key: string } {
  const sep = flatKey.indexOf(INI_FLAT_SEP);
  if (sep < 0) {
    return { section: INI_ROOT_SECTION, key: flatKey };
  }
  return {
    section: flatKey.slice(0, sep) || INI_ROOT_SECTION,
    key: flatKey.slice(sep + INI_FLAT_SEP.length),
  };
}

/** One INI line plus the exact separator that followed it (`""` if none). */
export type IniTextLine = { content: string; eol: string };

/** Split so mixed LF/CRLF separators can be preserved on rewrite (#667). */
export function splitIniTextWithEols(text: string): IniTextLine[] {
  const lines: IniTextLine[] = [];
  let start = 0;
  let index = 0;
  while (index < text.length) {
    if (text[index] === "\r" && text[index + 1] === "\n") {
      lines.push({ content: text.slice(start, index), eol: "\r\n" });
      index += 2;
      start = index;
      continue;
    }
    if (text[index] === "\n") {
      lines.push({ content: text.slice(start, index), eol: "\n" });
      index += 1;
      start = index;
      continue;
    }
    index += 1;
  }
  if (start < text.length) {
    lines.push({ content: text.slice(start), eol: "" });
  }
  return lines;
}

export function joinIniTextWithEols(lines: readonly IniTextLine[]): string {
  return lines.map((line) => `${line.content}${line.eol}`).join("");
}

function preferredIniEol(lines: readonly IniTextLine[]): string {
  if (lines.some((line) => line.eol === "\r\n")) {
    return "\r\n";
  }
  if (lines.some((line) => line.eol === "\n")) {
    return "\n";
  }
  return "\n";
}

function ensureTrailingIniNewline(lines: IniTextLine[], eol: string): void {
  if (lines.length === 0) {
    return;
  }
  const last = lines[lines.length - 1];
  if (last !== undefined && last.eol === "") {
    last.eol = eol;
  }
}

/**
 * Whether the section already carries a live assignment of `key`, and where its
 * comment-style default (`#Key=…` / `;Key=…`) sits. The shipped GameUserSettings.ini
 * documents optional keys this way, so a first write must uncomment that line instead of
 * appending a second assignment at the section end.
 */
function scanKeySlots(
  lines: readonly string[],
  sectionLower: string,
  keyLower: string,
): { hasActive: boolean; commentedIndex: number } {
  let currentSection = INI_ROOT_SECTION.toLowerCase();
  let hasActive = false;
  let commentedIndex = -1;

  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index]?.trim() ?? "";
    const sectionMatch = /^\[(.+)\]$/.exec(trimmed);
    if (sectionMatch !== null) {
      currentSection = (sectionMatch[1] ?? INI_ROOT_SECTION).trim().toLowerCase();
      continue;
    }
    if (currentSection !== sectionLower) {
      continue;
    }
    const commented = trimmed.startsWith("#") || trimmed.startsWith(";");
    // One marker only: a doubly-commented line (`##Key=…`) is not the shipped default,
    // it is a line someone deliberately disabled, and must stay commented.
    const body = commented ? trimmed.replace(/^[#;]?\s*/, "") : trimmed;
    const eq = body.indexOf("=");
    if (eq <= 0 || body.slice(0, eq).trim().toLowerCase() !== keyLower) {
      continue;
    }
    if (commented) {
      if (commentedIndex < 0) {
        commentedIndex = index;
      }
      continue;
    }
    hasActive = true;
  }

  return { hasActive, commentedIndex };
}

/**
 * Updates or inserts a key while preserving the rest of the file
 * (order, comments, blank lines, and per-line separators) as best as possible.
 *
 * `occurrence` selects which of the duplicate keys (0-based) to update.
 * In Unreal/ARK it is normal to repeat the same key (e.g. LastJoinedSessionPerCategory).
 */
export function setIniTextValue(text: string, section: string, key: string, value: string, occurrence = 0): string {
  const source = splitIniTextWithEols(text);
  const eol = preferredIniEol(source);
  const result: IniTextLine[] = [];
  let currentSection = INI_ROOT_SECTION;
  let currentSectionLower = currentSection.toLowerCase();
  let found = false;
  let matchIndex = 0;
  const sectionLower = section.toLowerCase();
  const keyLower = key.toLowerCase();
  const targetOccurrence = Math.max(0, Math.floor(occurrence));
  const slots = scanKeySlots(
    source.map((line) => line.content),
    sectionLower,
    keyLower,
  );
  const commentedSlotIndex = !slots.hasActive && targetOccurrence === 0 ? slots.commentedIndex : -1;

  const pushNew = (content: string): void => {
    result.push({ content, eol });
  };

  const flushMissingKeyBeforeLeavingSection = (nextSectionLine: IniTextLine | null) => {
    if (found || currentSectionLower !== sectionLower || targetOccurrence > 0) {
      if (nextSectionLine !== null) {
        result.push(nextSectionLine);
      }
      return;
    }
    pushNew(`${key}=${value}`);
    found = true;
    if (nextSectionLine !== null) {
      result.push(nextSectionLine);
    }
  };

  for (let index = 0; index < source.length; index += 1) {
    const line = source[index] ?? { content: "", eol: "" };
    const trimmed = line.content.trim();
    const sectionMatch = /^\[(.+)\]$/.exec(trimmed);

    if (sectionMatch !== null) {
      flushMissingKeyBeforeLeavingSection(line);
      currentSection = sectionMatch[1] ?? INI_ROOT_SECTION;
      currentSectionLower = currentSection.toLowerCase();
      continue;
    }

    // `!found` matters when the same section name appears twice: the first block already
    // got its assignment from `flushMissingKeyBeforeLeavingSection`, and uncommenting the
    // slot in the second block would leave two live assignments for one key.
    if (index === commentedSlotIndex && !found) {
      const indent = line.content.match(/^\s*/)?.[0] ?? "";
      result.push({ content: `${indent}${key}=${value}`, eol: line.eol || eol });
      found = true;
      continue;
    }

    if (
      currentSectionLower === sectionLower &&
      trimmed.length > 0 &&
      !trimmed.startsWith(";") &&
      !trimmed.startsWith("#")
    ) {
      const eq = trimmed.indexOf("=");
      if (eq > 0) {
        const lineKey = trimmed.slice(0, eq).trim();
        if (lineKey.toLowerCase() === keyLower) {
          if (matchIndex === targetOccurrence) {
            const indent = line.content.match(/^\s*/)?.[0] ?? "";
            result.push({ content: `${indent}${key}=${value}`, eol: line.eol || eol });
            found = true;
            matchIndex += 1;
            continue;
          }
          matchIndex += 1;
        }
      }
    }

    result.push(line);
  }

  if (!found && targetOccurrence === 0) {
    if (currentSectionLower === sectionLower) {
      pushNew(`${key}=${value}`);
      found = true;
    }
  }

  if (!found && targetOccurrence === 0) {
    if (section === INI_ROOT_SECTION) {
      result.unshift({ content: `${key}=${value}`, eol });
    } else {
      const last = result[result.length - 1];
      if (result.length > 0 && last !== undefined && last.content.trim() !== "") {
        pushNew("");
      }
      pushNew(`[${section}]`);
      pushNew(`${key}=${value}`);
    }
  }

  ensureTrailingIniNewline(result, eol);
  return joinIniTextWithEols(result);
}

/**
 * Removes one **live** key assignment from a section (first occurrence by default).
 * Comment lines (`#` / `;`) are never counted or removed — same rules as
 * {@link parseIniTextRows} / semantic Unset (#667).
 * Preserves surrounding comments, blank lines, and each original line separator.
 */
export function removeIniTextValue(text: string, section: string, key: string, occurrence = 0): string {
  const source = splitIniTextWithEols(text);
  const eol = preferredIniEol(source);
  const result: IniTextLine[] = [];
  let currentSection = INI_ROOT_SECTION;
  let matchIndex = 0;
  const sectionLower = section.toLowerCase();
  const keyLower = key.toLowerCase();
  const targetOccurrence = Math.max(0, Math.floor(occurrence));

  for (const line of source) {
    const trimmed = line.content.trim();
    const sectionMatch = /^\[(.+)\]$/.exec(trimmed);
    if (sectionMatch !== null) {
      currentSection = sectionMatch[1] ?? INI_ROOT_SECTION;
      result.push(line);
      continue;
    }

    // Skip comments so occurrence indexes match parseIniTextRows / getIniTextValueAt.
    if (trimmed.startsWith(";") || trimmed.startsWith("#")) {
      result.push(line);
      continue;
    }

    const eq = trimmed.indexOf("=");
    if (
      eq > 0 &&
      currentSection.toLowerCase() === sectionLower &&
      trimmed.slice(0, eq).trim().toLowerCase() === keyLower
    ) {
      if (matchIndex === targetOccurrence) {
        matchIndex += 1;
        continue;
      }
      matchIndex += 1;
    }
    result.push(line);
  }

  ensureTrailingIniNewline(result, eol);
  return joinIniTextWithEols(result);
}

/**
 * Append `key=value` at the end of an existing section (new trailing duplicate).
 * Preserves each original line separator; only the inserted line uses a preferred EOL.
 */
export function appendIniTextValue(text: string, section: string, key: string, value: string): string {
  const source = splitIniTextWithEols(text);
  const eol = preferredIniEol(source);
  const sectionLower = section.toLowerCase();
  let currentSection = "(root)";
  let lastKeyLineInSection = -1;
  let sectionHeaderIndex = -1;

  for (let index = 0; index < source.length; index += 1) {
    const trimmed = (source[index]?.content ?? "").trim();
    const sectionMatch = /^\[(.+)\]$/.exec(trimmed);
    if (sectionMatch !== null) {
      currentSection = (sectionMatch[1] ?? "(root)").trim();
      if (currentSection.toLowerCase() === sectionLower) {
        sectionHeaderIndex = index;
        lastKeyLineInSection = index;
      }
      continue;
    }
    if (currentSection.toLowerCase() !== sectionLower) {
      continue;
    }
    if (trimmed.length > 0 && !trimmed.startsWith(";") && !trimmed.startsWith("#")) {
      lastKeyLineInSection = index;
    }
  }

  if (sectionHeaderIndex < 0) {
    return setIniTextValue(text, section, key, value, 0);
  }

  const insertAt = lastKeyLineInSection >= sectionHeaderIndex ? lastKeyLineInSection + 1 : sectionHeaderIndex + 1;
  const next = [...source];
  next.splice(insertAt, 0, { content: `${key}=${value}`, eol });
  ensureTrailingIniNewline(next, eol);
  return joinIniTextWithEols(next);
}

/** Short category name: last part after the dot (GameSession). */
export function sectionShortName(section: string): string {
  if (section === INI_ROOT_SECTION) {
    return INI_ROOT_SECTION;
  }
  const lastDot = section.lastIndexOf(".");
  if (lastDot >= 0 && lastDot < section.length - 1) {
    return section.slice(lastDot + 1);
  }
  return section.replace(/^\//, "");
}
