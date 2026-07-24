/**
 * Parser/serializer de INI orientado a ARK ASA.
 *
 * Importante: NO usa el paquete `ini` para leer/escribir, porque trata los
 * puntos dentro de cabeceras como anidación. En ASA es normal tener:
 *   [/Script/Engine.GameSession]
 *   MaxPlayers=70
 * y eso debe permanecer como sección literal + clave MaxPlayers.
 */

export interface IniTextRow {
  section: string;
  key: string;
  value: string;
}

export const INI_ROOT_SECTION = "(root)";

/** Separador interno para mapas planos section+key (no aparece en INIs de ASA). */
export const INI_FLAT_SEP = "\u001f";

/**
 * Keys de cliente/historial de Unreal. En un dedicated server no aportan y
 * suelen repetirse (LastJoinedSessionPerCategory, etc.).
 */
const CLIENT_INI_KEY_RE =
  /^(LastJoinedSessionPerCategory|LastServerSearch|PlayedMaps|LocalSuperPeeker|DesiredScreen|FullscreenMode|LastConfirmed|bUseVSync|AudioQualityLevel|bUseMouse|bUseGamepad|MouseSensitivity|MasterVolume|MusicVolume|SFXVolume|UIVolume|VoiceVolume)/i;

export function isClientIniKey(key: string): boolean {
  return CLIENT_INI_KEY_RE.test(key.trim());
}

/**
 * Elimina líneas de keys de cliente, preservando el resto del archivo.
 * También descarta secciones que queden vacías tras la limpieza.
 */
export function stripClientIniKeys(text: string): string {
  const lines = text.split(/\r?\n/);
  const kept: string[] = [];
  let sectionHeader: string | null = null;
  let sectionBody: string[] = [];
  let sectionKeyCount = 0;

  const commitSection = () => {
    if (sectionHeader === null) {
      return;
    }
    if (sectionKeyCount > 0) {
      kept.push(sectionHeader, ...sectionBody);
    }
    sectionHeader = null;
    sectionBody = [];
    sectionKeyCount = 0;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const sectionMatch = /^\[(.+)\]$/.exec(trimmed);

    if (sectionMatch !== null) {
      commitSection();
      sectionHeader = line;
      continue;
    }

    const eq = trimmed.indexOf("=");
    const isAssignment =
      eq > 0 && !trimmed.startsWith(";") && !trimmed.startsWith("#");

    if (isAssignment) {
      const key = trimmed.slice(0, eq).trim();
      if (isClientIniKey(key)) {
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
 * Actualiza o inserta una clave preservando el resto del archivo
 * (orden, comentarios y líneas en blanco) lo mejor posible.
 *
 * `occurrence` selecciona cuál de las claves duplicadas (0-based) actualizar.
 * En Unreal/ARK es normal repetir la misma key (p. ej. LastJoinedSessionPerCategory).
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
  let found = false;
  let matchIndex = 0;
  const keyLower = key.toLowerCase();
  const targetOccurrence = Math.max(0, Math.floor(occurrence));

  const flushMissingKeyBeforeLeavingSection = (nextSectionLine: string | null) => {
    if (found || currentSection !== section || targetOccurrence > 0) {
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
      continue;
    }

    if (currentSection === section && trimmed.length > 0 && !trimmed.startsWith(";") && !trimmed.startsWith("#")) {
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
    if (currentSection === section) {
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

/** Nombre corto de categoría: última parte tras el punto (GameSession). */
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
