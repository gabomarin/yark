import type { ConflictKeepSide, IniConflictOccurrence } from "@shared/ini/ini-conflict";
import type { IniFileKey } from "@shared/types";

export function conflictFileLabel(fileKey: IniFileKey): string {
  return fileKey === "game" ? "Game.ini" : "GameUserSettings.ini";
}

/** 1-based label. The first copy stays unlabeled. */
function conflictCopyLabel(occurrence: number): string | null {
  if (occurrence <= 0) return null;
  return `Copy ${occurrence + 1}`;
}

export function conflictValueText(value: string | null): { text: string; kind: "absent" | "empty" | "value" } {
  if (value === null) return { text: "Not in the file", kind: "absent" };
  if (value.length === 0) return { text: "Empty", kind: "empty" };
  return { text: value, kind: "value" };
}

export function conflictHeading(conflict: IniConflictOccurrence): string {
  const copy = conflictCopyLabel(conflict.occurrence);
  return copy === null ? conflict.key : `${conflict.key} (${copy})`;
}

export function conflictAlertSentence(count: number): string {
  const setting = count === 1 ? "This setting also changed" : "These settings also changed";
  return `Save did not write. ${setting} in the file. Pick which value to use, then accept.`;
}

/** Your edit is the default. A failed print cannot be selected, so the file value is. */
export function defaultConflictSide(conflict: IniConflictOccurrence): ConflictKeepSide {
  return conflict.local !== null || conflict.removes === true ? "yark" : "file";
}

export function conflictRowKey(conflict: IniConflictOccurrence): string {
  return `${conflict.fileKey}.${conflict.section}.${conflict.key}.${conflict.occurrence}`;
}

/** A short scalar can sit in the button. A blank, a missing line, or a long line stays generic. */
function shortConflictValue(value: string | null): string | null {
  const shown = conflictValueText(value);
  if (shown.kind !== "value" || shown.text.length > 24 || shown.text.includes("\n")) return null;
  return shown.text;
}

/** Tooltip and accessible name for the check that keeps this side. */
export function conflictKeepName(side: ConflictKeepSide, value: string | null): string {
  const short = shortConflictValue(value);
  if (side === "yark") return short === null ? "Use my value" : `Use ${short}`;
  if (side === "file") return short === null ? "Use the file's value" : `Use the file's ${short}`;
  return short === null ? "Revert to last save" : `Revert to ${short}`;
}

const INLINE_CONFLICT_LIMIT = 4;

/** A long line, or more than four settings, needs the scrollable dialog. */
export function conflictReviewNeedsModal(conflicts: readonly IniConflictOccurrence[]): boolean {
  if (conflicts.length > INLINE_CONFLICT_LIMIT) return true;
  return conflicts.some((row) =>
    [row.loaded, row.local, row.disk].some((value) => value !== null && (value.length > 24 || value.includes("\n"))),
  );
}
