import type { ServerIniPayload } from "../types";
import ownershipSeed from "../ini/ini-setting-ownership-seed.json";
import {
  isAsaIgnoredIniMaxPlayers,
  isCatalogOwnedIniKey,
} from "../ini/ini-setting-decisions";

/**
 * GameUserSettings keys that cluster INI templates must not author.
 *
 * Compatibility facade over the shared ownership seed / catalog decisions
 * (PINI-016 / #659). Prefer `@shared/ini/ini-setting-decisions` for new code.
 *
 * Ownership kinds (legacyReason on the seed):
 * - `profileSync` — rewritten from ServerProfile by `syncProfileSettingsToIni`
 * - `aseLegacy` — ASE-era INI / Steam Workshop keys (`ActiveMods`, etc.). ASA
 *   dedicated servers use CurseForge Project IDs on the CLI (`-mods=` from
 *   `profile.mods`); YARK does not read these INI values at launch.
 *
 * After template apply (#89/#90), profileSync keys are recomposed from the
 * profile; aseLegacy keys stay absent so operators manage mods on the Mods
 * panel instead of stale INI copies. INI MaxPlayers is not profile-owned:
 * ASA ignores it and uses `-WinLiveMaxPlayers` from the Server form. Cluster
 * templates still strip MaxPlayers so they cannot author a decoy slot limit.
 */
export type YarkOwnedIniReason = "profileSync" | "aseLegacy";

export interface YarkOwnedIniKey {
  /** INI file — owned keys today are GameUserSettings only. */
  file: "gameUserSettings";
  section: string;
  key: string;
  reason: YarkOwnedIniReason;
}

export { isAsaIgnoredIniMaxPlayers };

function parseSeedOwnedKeys(): YarkOwnedIniKey[] {
  const out: YarkOwnedIniKey[] = [];
  for (const [id, raw] of Object.entries(ownershipSeed)) {
    if (id.startsWith("$")) continue;
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as { legacyReason?: string };
    const reason = entry.legacyReason;
    if (reason !== "profileSync" && reason !== "aseLegacy") continue;
    const parts = id.split(":");
    if (parts.length < 3) continue;
    const file = parts[0];
    const key = parts[parts.length - 1] ?? "";
    const section = parts.slice(1, -1).join(":");
    if (file !== "gameUserSettings" || !section || !key) continue;
    out.push({ file, section, key, reason });
  }
  return out;
}

export const YARK_OWNED_INI_KEYS: readonly YarkOwnedIniKey[] = parseSeedOwnedKeys();

const OWNED_KEY_SET: ReadonlySet<string> = new Set(
  YARK_OWNED_INI_KEYS.map((entry) => `${entry.section.toLowerCase()}\u001f${entry.key.toLowerCase()}`),
);

/** True when this GameUserSettings section/key is YARK-owned (case-insensitive). */
export function isYarkOwnedIniKey(section: string, key: string): boolean {
  // Prefer catalog ownership when present; fall back to seed set for parity.
  if (isCatalogOwnedIniKey(section, key)) {
    return true;
  }
  return OWNED_KEY_SET.has(`${section.trim().toLowerCase()}\u001f${key.trim().toLowerCase()}`);
}

/**
 * Removes YARK-owned assignments from INI text while preserving other lines,
 * comments, and unknown keys. Empty sections are dropped. Also drops INI
 * MaxPlayers (ASA ignores it; the live cap is `-WinLiveMaxPlayers`).
 */
export function stripYarkOwnedIniKeys(text: string): string {
  const owned = OWNED_KEY_SET;
  const lines = text.split(/\r?\n/);
  const kept: string[] = [];
  let sectionHeader: string | null = null;
  let sectionName = "(root)";
  let sectionBody: string[] = [];
  let sectionKeyCount = 0;

  const commitSection = (): void => {
    if (sectionHeader === null) {
      return;
    }
    if (sectionKeyCount > 0) {
      kept.push(sectionHeader, ...sectionBody);
    }
    sectionHeader = null;
    sectionName = "(root)";
    sectionBody = [];
    sectionKeyCount = 0;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const sectionMatch = /^\[(.+)\]$/.exec(trimmed);

    if (sectionMatch !== null) {
      commitSection();
      sectionHeader = line;
      sectionName = (sectionMatch[1] ?? "").trim();
      continue;
    }

    const eq = trimmed.indexOf("=");
    const isAssignment = eq > 0 && !trimmed.startsWith(";") && !trimmed.startsWith("#");

    if (isAssignment) {
      const key = trimmed.slice(0, eq).trim();
      const flat = `${sectionName.toLowerCase()}\u001f${key.toLowerCase()}`;
      if (owned.has(flat) || isAsaIgnoredIniMaxPlayers(key)) {
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

/** Strip owned keys from both template INI files (Game.ini is a no-op today). */
export function stripYarkOwnedFromPayload(payload: ServerIniPayload): ServerIniPayload {
  return {
    gameUserSettings: stripYarkOwnedIniKeys(payload.gameUserSettings),
    game: payload.game,
  };
}
