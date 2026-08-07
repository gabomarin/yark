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

export const INI_ROOT_SECTION = "(root)";

/** Internal separator for flat section+key maps (does not appear in ASA INIs). */
export const INI_FLAT_SEP = "\u001f";

/**
 * Typical Unreal client / graphics sections.
 * They do not apply on a dedicated server and clutter the editor.
 */
export function isClientIniSection(section: string): boolean {
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
    if (
      /dlss|fsr|xess|reflex|framegeneration|superresolution|graphics|resolution|vsync|hdr/.test(
        k,
      )
    ) {
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
    const isAssignment =
      eq > 0 && !trimmed.startsWith(";") && !trimmed.startsWith("#");

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

export function sanitizeServerIniPayload(payload: {
  gameUserSettings: string;
  game: string;
}): { gameUserSettings: string; game: string } {
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

/**
 * Updates or inserts a key while preserving the rest of the file
 * (order, comments, and blank lines) as best as possible.
 *
 * `occurrence` selects which of the duplicate keys (0-based) to update.
 * In Unreal/ARK it is normal to repeat the same key (e.g. LastJoinedSessionPerCategory).
 */
export function setIniTextValue(
  text: string,
  section: string,
  key: string,
  value: string,
  occurrence = 0,
): string {
  const lines = text.split(/\r?\n/);
  const result: string[] = [];
  let currentSection = INI_ROOT_SECTION;
  let currentSectionLower = currentSection.toLowerCase();
  let found = false;
  let matchIndex = 0;
  const sectionLower = section.toLowerCase();
  const keyLower = key.toLowerCase();
  const targetOccurrence = Math.max(0, Math.floor(occurrence));

  const flushMissingKeyBeforeLeavingSection = (nextSectionLine: string | null) => {
    if (
      found ||
      currentSectionLower !== sectionLower ||
      targetOccurrence > 0
    ) {
      if (nextSectionLine !== null) {
        result.push(nextSectionLine);
      }
      return;
    }
    result.push(`${key}=${value}`);
    found = true;
    if (nextSectionLine !== null) {
      result.push(nextSectionLine);
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const sectionMatch = /^\[(.+)\]$/.exec(trimmed);

    if (sectionMatch !== null) {
      flushMissingKeyBeforeLeavingSection(line);
      currentSection = sectionMatch[1] ?? INI_ROOT_SECTION;
      currentSectionLower = currentSection.toLowerCase();
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
            const indent = line.match(/^\s*/)?.[0] ?? "";
            result.push(`${indent}${key}=${value}`);
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
      result.push(`${key}=${value}`);
      found = true;
    }
  }

  if (!found && targetOccurrence === 0) {
    if (section === INI_ROOT_SECTION) {
      result.unshift(`${key}=${value}`);
    } else {
      if (result.length > 0 && result[result.length - 1]?.trim() !== "") {
        result.push("");
      }
      result.push(`[${section}]`);
      result.push(`${key}=${value}`);
    }
  }

  let out = result.join("\n");
  if (!out.endsWith("\n")) {
    out += "\n";
  }
  return out;
}

/**
 * Removes one key assignment from a section (first occurrence by default).
 * Preserves surrounding comments and blank lines when possible.
 */
export function removeIniTextValue(
  text: string,
  section: string,
  key: string,
  occurrence = 0,
): string {
  const lines = text.split(/\r?\n/);
  const result: string[] = [];
  let currentSection = INI_ROOT_SECTION;
  let matchIndex = 0;
  const sectionLower = section.toLowerCase();
  const keyLower = key.toLowerCase();
  const targetOccurrence = Math.max(0, Math.floor(occurrence));

  for (const line of lines) {
    const trimmed = line.trim();
    const sectionMatch = /^\[(.+)\]$/.exec(trimmed);
    if (sectionMatch !== null) {
      currentSection = sectionMatch[1] ?? INI_ROOT_SECTION;
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

  let out = result.join("\n");
  if (out.length > 0 && !out.endsWith("\n")) {
    out += "\n";
  }
  return out;
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

export function sectionBracketLabel(section: string): string {
  if (section === INI_ROOT_SECTION) {
    return INI_ROOT_SECTION;
  }
  return `[${section}]`;
}
