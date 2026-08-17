import type { ServerIniPayload } from "./types";

/**
 * GameUserSettings keys that cluster INI templates must not author.
 *
 * Ownership kinds:
 * - `profileSync` — rewritten from ServerProfile by `syncProfileSettingsToIni`
 * - `aseLegacy` — ASE-era INI / Steam Workshop keys (`ActiveMods`, etc.). ASA
 *   dedicated servers use CurseForge Project IDs on the CLI (`-mods=` from
 *   `profile.mods`); YARK does not read these INI values at launch. Wiki dumps
 *   still list them, but they are not the ASA mod path.
 *
 * After template apply (#89/#90), profileSync keys are recomposed from the
 * profile; aseLegacy keys stay absent so operators manage mods on the Mods
 * panel instead of stale INI copies.
 */
export type YarkOwnedIniReason = "profileSync" | "aseLegacy";

export interface YarkOwnedIniKey {
  /** INI file — owned keys today are GameUserSettings only. */
  file: "gameUserSettings";
  section: string;
  key: string;
  reason: YarkOwnedIniReason;
}

export const YARK_OWNED_INI_KEYS: readonly YarkOwnedIniKey[] = [
  // --- profile → INI (sync-profile-ini.ts) ---
  {
    file: "gameUserSettings",
    section: "ServerSettings",
    key: "RCONEnabled",
    reason: "profileSync",
  },
  {
    file: "gameUserSettings",
    section: "ServerSettings",
    key: "RCONPort",
    reason: "profileSync",
  },
  {
    file: "gameUserSettings",
    section: "ServerSettings",
    key: "ServerAdminPassword",
    reason: "profileSync",
  },
  {
    file: "gameUserSettings",
    section: "ServerSettings",
    key: "ServerPassword",
    reason: "profileSync",
  },
  {
    file: "gameUserSettings",
    section: "SessionSettings",
    key: "SessionName",
    reason: "profileSync",
  },
  {
    file: "gameUserSettings",
    section: "SessionSettings",
    key: "Port",
    reason: "profileSync",
  },
  {
    file: "gameUserSettings",
    section: "SessionSettings",
    key: "QueryPort",
    reason: "profileSync",
  },
  {
    file: "gameUserSettings",
    section: "/Script/Engine.GameSession",
    key: "MaxPlayers",
    reason: "profileSync",
  },

  // --- ASE-era mod keys (not the ASA CurseForge path) ---
  {
    file: "gameUserSettings",
    section: "ServerSettings",
    key: "ActiveMods",
    reason: "aseLegacy",
  },
  {
    file: "gameUserSettings",
    section: "ServerSettings",
    key: "ActiveMapMod",
    reason: "aseLegacy",
  },
  {
    file: "gameUserSettings",
    section: "ServerSettings",
    key: "ActiveTotalConversion",
    reason: "aseLegacy",
  },
] as const;

const OWNED_KEY_SET: ReadonlySet<string> = new Set(
  YARK_OWNED_INI_KEYS.map(
    (entry) =>
      `${entry.section.toLowerCase()}\u001f${entry.key.toLowerCase()}`,
  ),
);

/** True when this GameUserSettings section/key is YARK-owned (case-insensitive). */
export function isYarkOwnedIniKey(section: string, key: string): boolean {
  return OWNED_KEY_SET.has(
    `${section.trim().toLowerCase()}\u001f${key.trim().toLowerCase()}`,
  );
}

/**
 * Leftover `[ServerSettings] MaxPlayers` is not profile-owned (templates may
 * still store it), but ASA ignores it. Hide it from the dedicated editor and
 * cluster apply previews; sync/apply strips it from member files.
 */
export function isLegacyServerSettingsMaxPlayers(
  section: string,
  key: string,
): boolean {
  return (
    section.trim().toLowerCase() === "serversettings" &&
    key.trim().toLowerCase() === "maxplayers"
  );
}

/**
 * Removes YARK-owned assignments from INI text while preserving other lines,
 * comments, and unknown keys. Empty sections are dropped.
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
    const isAssignment =
      eq > 0 && !trimmed.startsWith(";") && !trimmed.startsWith("#");

    if (isAssignment) {
      const key = trimmed.slice(0, eq).trim();
      const flat = `${sectionName.toLowerCase()}\u001f${key.toLowerCase()}`;
      if (owned.has(flat)) {
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
export function stripYarkOwnedFromPayload(
  payload: ServerIniPayload,
): ServerIniPayload {
  return {
    gameUserSettings: stripYarkOwnedIniKeys(payload.gameUserSettings),
    game: payload.game,
  };
}
