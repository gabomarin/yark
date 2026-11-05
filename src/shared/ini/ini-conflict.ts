import type { IniFileKey, ServerIniPayload } from "../types";
import { removeIniTextValue, setIniTextValue } from "./ini-text";

/** One overlapping occurrence. `null` means that side has no assignment. */
export interface IniConflictOccurrence {
  kind: "scalar" | "engram" | "crate";
  fileKey: IniFileKey;
  section: string;
  key: string;
  occurrence: number;
  /** Value from the last successful YARK save. The editor load is that baseline until the next save. */
  loaded: string | null;
  /** Value the open draft wants. `null` with `removes` deletes the occurrence. */
  local: string | null;
  /** True when the draft removes this occurrence. A null local without this flag is not a delete. */
  removes?: boolean;
  /** Value on disk at the failed Save. */
  disk: string | null;
}

export class IniConflictReviewError extends Error {
  readonly code: string;
  readonly conflicts: readonly IniConflictOccurrence[];

  constructor(conflicts: readonly IniConflictOccurrence[]) {
    const key = conflicts[0]?.key ?? "INI";
    super(`${key} changed outside YARK since this editor loaded. Reload or resolve the conflict before saving.`);
    this.name = "IniConflictReviewError";
    this.conflicts = conflicts;
    this.code = conflictReviewCode(conflicts);
  }
}

/** IPC code for a failed Save. Mixed batches use the scalar conflict code. */
function conflictReviewCode(conflicts: readonly IniConflictOccurrence[]): string {
  const kinds = new Set(conflicts.map((row) => row.kind));
  if (kinds.size === 1 && kinds.has("engram")) return "NAMED_ENGRAM_STALE";
  if (kinds.size === 1 && kinds.has("crate")) return "SUPPLY_CRATE_STALE";
  return "INI_SEMANTIC_CONFLICT";
}

export function sameConflictOccurrence(left: IniConflictOccurrence, right: IniConflictOccurrence): boolean {
  return (
    left.fileKey === right.fileKey &&
    left.section.trim().toLowerCase() === right.section.trim().toLowerCase() &&
    left.key.trim().toLowerCase() === right.key.trim().toLowerCase() &&
    left.occurrence === right.occurrence
  );
}

export type ConflictKeepSide = "saved" | "yark" | "file";

/** Value the operator chose to keep. `null` means the occurrence should be absent. */
export function keptConflictValue(conflict: IniConflictOccurrence, side: ConflictKeepSide): string | null {
  if (side === "saved") return conflict.loaded;
  if (side === "file") return conflict.disk;
  return conflict.local;
}

/** A null YARK value is a delete only when the draft said so. A failed print cannot be kept. */
export function canKeepConflictSide(conflict: IniConflictOccurrence, side: ConflictKeepSide): boolean {
  if (side !== "yark") return true;
  return conflict.local !== null || conflict.removes === true;
}

/** Write the kept value onto the disk value the review showed. `null` means the file already has it. */
export function semanticOpForKeptSide(
  conflict: IniConflictOccurrence,
  side: ConflictKeepSide,
):
  | {
      kind: "set";
      fileKey: IniFileKey;
      section: string;
      key: string;
      occurrence: number;
      expectedPreviousValue: string | null;
      nextValue: string;
    }
  | {
      kind: "unset";
      fileKey: IniFileKey;
      section: string;
      key: string;
      occurrence: number;
      expectedPreviousValue: string;
    }
  | null {
  if (!canKeepConflictSide(conflict, side)) return null;
  const next = keptConflictValue(conflict, side);
  if (next === conflict.disk) return null;
  if (next === null) {
    if (conflict.disk === null) return null;
    return {
      kind: "unset",
      fileKey: conflict.fileKey,
      section: conflict.section,
      key: conflict.key,
      occurrence: conflict.occurrence,
      expectedPreviousValue: conflict.disk,
    };
  }
  return {
    kind: "set",
    fileKey: conflict.fileKey,
    section: conflict.section,
    key: conflict.key,
    occurrence: conflict.occurrence,
    expectedPreviousValue: conflict.disk,
    nextValue: next,
  };
}

/** Payload after this occurrence keeps the chosen value. Other edits in the text stay put. */
export function payloadWithKeptValue(
  payload: ServerIniPayload,
  conflict: IniConflictOccurrence,
  side: ConflictKeepSide,
): ServerIniPayload {
  const text = conflict.fileKey === "gameUserSettings" ? payload.gameUserSettings : payload.game;
  const kept = keptConflictValue(conflict, side);
  const removes = side === "yark" ? conflict.removes === true && kept === null : kept === null;
  const next =
    kept === null
      ? removes
        ? removeIniTextValue(text, conflict.section, conflict.key, conflict.occurrence)
        : text
      : setIniTextValue(text, conflict.section, conflict.key, kept, conflict.occurrence);
  return conflict.fileKey === "gameUserSettings" ? { ...payload, gameUserSettings: next } : { ...payload, game: next };
}
