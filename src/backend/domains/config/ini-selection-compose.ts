/**
 * Compose target INI text from a source snapshot using #95 selection rules.
 */

import {
  flattenIniText,
  INI_FLAT_SEP,
  parseIniTextRows,
  removeIniTextValue,
  setIniTextValue,
  splitFlatIniKey,
} from "@shared/ini-text";
import {
  isConfigTransferBlockedGusKey,
  type ConfigTransferIniFileSelection,
  type ConfigTransferSelection,
} from "@shared/config-transfer";
import type { ServerIniPayload, ServerProfile } from "@shared/types";
import {
  applyProfileOwnedKeysToGameUserSettings,
  resolveMemberIdentity,
  type ProfileIniIdentity,
} from "./ini-compose";

function collectSourceKeys(
  sourceText: string,
  file: ConfigTransferIniFileSelection,
  fileKey: "game" | "gameUserSettings",
): Array<{ section: string; key: string; value: string }> {
  const rows = parseIniTextRows(sourceText);
  const selectedSections = new Set(
    file.sections.map((s) => s.toLowerCase()),
  );
  const selectedKeys = new Set(
    file.keys.map((k) => `${k.section.toLowerCase()}${INI_FLAT_SEP}${k.key.toLowerCase()}`),
  );

  const out: Array<{ section: string; key: string; value: string }> = [];
  for (const row of rows) {
    if (
      fileKey === "gameUserSettings" &&
      isConfigTransferBlockedGusKey(row.section, row.key)
    ) {
      continue;
    }
    const sectionLower = row.section.toLowerCase();
    const flat = `${sectionLower}${INI_FLAT_SEP}${row.key.toLowerCase()}`;
    const include =
      file.entireFile ||
      selectedSections.has(sectionLower) ||
      selectedKeys.has(flat);
    if (!include) continue;
    out.push(row);
  }
  return out;
}

function sectionKeySet(
  text: string,
  section: string,
): Set<string> {
  const sectionLower = section.toLowerCase();
  const keys = new Set<string>();
  for (const row of parseIniTextRows(text)) {
    if (row.section.toLowerCase() === sectionLower) {
      keys.add(row.key.toLowerCase());
    }
  }
  return keys;
}

/**
 * Apply merge/replace selection from source onto target for one INI file.
 * Key-level selections always merge. Blocked GUS owned keys are never copied.
 */
export function composeIniFileFromSelection(
  sourceText: string,
  targetText: string,
  file: ConfigTransferIniFileSelection,
  fileKey: "game" | "gameUserSettings",
): string {
  if (!file.enabled) {
    return targetText;
  }

  const sourceKeys = collectSourceKeys(sourceText, file, fileKey);
  if (sourceKeys.length === 0 && !file.entireFile && file.sections.length === 0) {
    return targetText;
  }

  // Key-only selection (no entire file / sections): always merge those keys.
  const keyOnly =
    !file.entireFile && file.sections.length === 0 && file.keys.length > 0;

  if (file.strategy === "replace" && file.entireFile && !keyOnly) {
    // Full-file replace rebuilds from filtered source keys only so blocked
    // GUS owned/ASE-legacy keys never land on the target.
    let replaced = "";
    for (const row of sourceKeys) {
      replaced = setIniTextValue(replaced, row.section, row.key, row.value);
    }
    return replaced;
  }

  let result = targetText;

  if (file.strategy === "replace" && !file.entireFile) {
    // Replace selected sections: drop target keys in those sections that are
    // not present in the source selection for that section.
    for (const section of file.sections) {
      const sourceInSection = new Set(
        sourceKeys
          .filter((r) => r.section.toLowerCase() === section.toLowerCase())
          .map((r) => r.key.toLowerCase()),
      );
      for (const key of sectionKeySet(result, section)) {
        if (!sourceInSection.has(key)) {
          // Find original casing from target rows
          const targetRow = parseIniTextRows(result).find(
            (r) =>
              r.section.toLowerCase() === section.toLowerCase() &&
              r.key.toLowerCase() === key,
          );
          if (targetRow) {
            result = removeIniTextValue(result, targetRow.section, targetRow.key);
          }
        }
      }
    }
  }

  for (const row of sourceKeys) {
    result = setIniTextValue(result, row.section, row.key, row.value);
  }

  return result;
}

export function composeIniPayloadFromSelection(
  source: ServerIniPayload,
  target: ServerIniPayload,
  selection: ConfigTransferSelection,
  targetProfile: ProfileIniIdentity,
  options?: { passwordsFromSource?: ProfileIniIdentity },
): ServerIniPayload {
  let gameUserSettings = composeIniFileFromSelection(
    source.gameUserSettings,
    target.gameUserSettings,
    selection.gameUserSettings,
    "gameUserSettings",
  );
  const game = composeIniFileFromSelection(
    source.game,
    target.game,
    selection.game,
    "game",
  );

  // Only reapply owned GUS keys when that file is part of the write set.
  if (!selection.gameUserSettings.enabled) {
    return { gameUserSettings: target.gameUserSettings, game };
  }

  // Always reapply target-owned identity after composition. When passwords are
  // opted in, passwordsFromSource supplies the new password fields while ports
  // / session still come from resolveMemberIdentity's target-disk preference —
  // so rebuild identity explicitly from target profile ports + chosen passwords.
  const owned: ProfileIniIdentity = {
    rconPort: targetProfile.rconPort,
    gamePort: targetProfile.gamePort,
    queryPort: targetProfile.queryPort,
    sessionName: targetProfile.sessionName,
    adminPassword: options?.passwordsFromSource?.adminPassword ?? targetProfile.adminPassword,
    serverPassword:
      options?.passwordsFromSource?.serverPassword ?? targetProfile.serverPassword,
  };
  // Prefer on-disk target ports/session when present.
  const resolved = resolveMemberIdentity(owned, target.gameUserSettings);
  gameUserSettings = applyProfileOwnedKeysToGameUserSettings(
    gameUserSettings,
    {
      ...resolved,
      adminPassword: owned.adminPassword,
      serverPassword: owned.serverPassword,
    },
  );

  return { gameUserSettings, game };
}

export function profileToIniIdentity(profile: ServerProfile): ProfileIniIdentity {
  return {
    rconPort: profile.rconPort,
    adminPassword: profile.adminPassword,
    serverPassword: profile.serverPassword,
    sessionName: profile.sessionName,
    gamePort: profile.gamePort,
    queryPort: profile.queryPort,
  };
}

/** Build a stable sorted map of selected source keys for fingerprinting. */
export function summarizeIniSelectionKeys(
  sourceText: string,
  file: ConfigTransferIniFileSelection,
  fileKey: "game" | "gameUserSettings",
): string[] {
  return collectSourceKeys(sourceText, file, fileKey)
    .map((r) => `${r.section}${INI_FLAT_SEP}${r.key}=${r.value}`)
    .sort();
}

export function listIniSectionsAndKeys(text: string): Array<{
  section: string;
  keys: string[];
}> {
  const bySection = new Map<string, string[]>();
  for (const row of parseIniTextRows(text)) {
    const list = bySection.get(row.section) ?? [];
    if (!list.some((k) => k.toLowerCase() === row.key.toLowerCase())) {
      list.push(row.key);
    }
    bySection.set(row.section, list);
  }
  return [...bySection.entries()].map(([section, keys]) => ({ section, keys }));
}

export function flatLookupValue(
  text: string,
  section: string,
  key: string,
): string | undefined {
  const flat = flattenIniText(text);
  const exact = flat[`${section}${INI_FLAT_SEP}${key}`];
  if (exact !== undefined) return exact;
  const sectionLower = section.toLowerCase();
  const keyLower = key.toLowerCase();
  for (const [flatKey, value] of Object.entries(flat)) {
    const parts = splitFlatIniKey(flatKey);
    if (
      parts.section.toLowerCase() === sectionLower &&
      parts.key.toLowerCase() === keyLower
    ) {
      return value;
    }
  }
  return undefined;
}
