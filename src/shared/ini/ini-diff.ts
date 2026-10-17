/**
 * Lightweight INI payload diff for operator summaries (#667).
 * Uses the same flatten rules as preview (last duplicate wins per section+key).
 */

import type { IniDiffEntry, IniFileKey, ServerIniPayload } from "../types";
import { flattenIniText, splitFlatIniKey } from "./ini-text";

function toDiffEntries(
  fileKey: IniFileKey,
  beforeMap: Record<string, string>,
  afterMap: Record<string, string>,
): IniDiffEntry[] {
  const keys = new Set([...Object.keys(beforeMap), ...Object.keys(afterMap)]);
  const entries: IniDiffEntry[] = [];

  for (const fullKey of [...keys].sort()) {
    const before = beforeMap[fullKey];
    const after = afterMap[fullKey];
    if (before === after) continue;

    const { section, key } = splitFlatIniKey(fullKey);
    entries.push({
      fileKey,
      section,
      key,
      before: before ?? null,
      after: after ?? null,
      change: before === undefined ? "added" : after === undefined ? "removed" : "changed",
    });
  }

  return entries;
}

/** Diff live key assignments between two sanitized payloads. */
export function diffServerIniPayloads(before: ServerIniPayload, after: ServerIniPayload): IniDiffEntry[] {
  return [
    ...toDiffEntries(
      "gameUserSettings",
      flattenIniText(before.gameUserSettings),
      flattenIniText(after.gameUserSettings),
    ),
    ...toDiffEntries("game", flattenIniText(before.game), flattenIniText(after.game)),
  ];
}
