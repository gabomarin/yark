/**
 * Lightweight INI payload diff for operator summaries (#667).
 * Compares live assignments including duplicate occurrence/order.
 */

import type { IniDiffEntry, IniFileKey, ServerIniPayload } from "../types";
import { parseIniTextRows } from "./ini-text";

function groupKey(section: string, key: string): string {
  return `${section.trim().toLowerCase()}\u001f${key.trim().toLowerCase()}`;
}

function toOccurrenceDiffEntries(fileKey: IniFileKey, beforeText: string, afterText: string): IniDiffEntry[] {
  const beforeRows = parseIniTextRows(beforeText);
  const afterRows = parseIniTextRows(afterText);

  const beforeByGroup = new Map<string, Array<{ section: string; key: string; value: string }>>();
  for (const row of beforeRows) {
    const group = groupKey(row.section, row.key);
    const list = beforeByGroup.get(group) ?? [];
    list.push({ section: row.section, key: row.key, value: row.value });
    beforeByGroup.set(group, list);
  }

  const afterByGroup = new Map<string, Array<{ section: string; key: string; value: string }>>();
  for (const row of afterRows) {
    const group = groupKey(row.section, row.key);
    const list = afterByGroup.get(group) ?? [];
    list.push({ section: row.section, key: row.key, value: row.value });
    afterByGroup.set(group, list);
  }

  const entries: IniDiffEntry[] = [];
  const groups = new Set([...beforeByGroup.keys(), ...afterByGroup.keys()]);
  for (const group of [...groups].sort()) {
    const beforeList = beforeByGroup.get(group) ?? [];
    const afterList = afterByGroup.get(group) ?? [];
    const max = Math.max(beforeList.length, afterList.length);
    for (let occurrence = 0; occurrence < max; occurrence += 1) {
      const before = beforeList[occurrence];
      const after = afterList[occurrence];
      if (before?.value === after?.value) {
        continue;
      }
      const section = after?.section ?? before?.section ?? "";
      const key = after?.key ?? before?.key ?? "";
      entries.push({
        fileKey,
        section,
        key,
        occurrence,
        before: before?.value ?? null,
        after: after?.value ?? null,
        change: before === undefined ? "added" : after === undefined ? "removed" : "changed",
      });
    }
  }

  return entries;
}

/** Diff live key assignments between two sanitized payloads (including duplicates). */
export function diffServerIniPayloads(before: ServerIniPayload, after: ServerIniPayload): IniDiffEntry[] {
  return [
    ...toOccurrenceDiffEntries("gameUserSettings", before.gameUserSettings, after.gameUserSettings),
    ...toOccurrenceDiffEntries("game", before.game, after.game),
  ];
}
