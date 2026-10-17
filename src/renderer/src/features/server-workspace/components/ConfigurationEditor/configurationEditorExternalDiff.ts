import { diffServerIniPayloads } from "@shared/ini/ini-diff";
import type { IniDiffEntry, ServerIniPayload } from "@shared/types";

/** Max rows shown in the outside-changes popover before “and N more”. */
export const EXTERNAL_INI_DIFF_PREVIEW_LIMIT = 8;

export function summarizeExternalIniDiff(
  baseline: ServerIniPayload | null,
  externalDisk: ServerIniPayload | null,
): { entries: IniDiffEntry[]; changedCount: number } {
  if (baseline === null || externalDisk === null) {
    return { entries: [], changedCount: 0 };
  }
  const entries = diffServerIniPayloads(baseline, externalDisk);
  return { entries, changedCount: entries.length };
}

export function formatExternalIniChangeSummary(changedCount: number): string {
  if (changedCount <= 0) {
    return "Another tool updated these files outside YARK (comments or formatting may differ).";
  }
  if (changedCount === 1) {
    return "Another tool changed 1 setting outside YARK.";
  }
  return `Another tool changed ${changedCount} settings outside YARK.`;
}

export function formatIniDiffChangeLabel(change: IniDiffEntry["change"]): string {
  if (change === "added") return "Added";
  if (change === "removed") return "Removed";
  return "Changed";
}
