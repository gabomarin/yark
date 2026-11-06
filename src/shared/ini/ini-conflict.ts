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
  /**
   * Every live value of this section and key when the conflict was detected.
   * Accept sends it back so an inserted duplicate cannot pass as the same row.
   */
  keyValues?: readonly string[];
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
function keptConflictValue(conflict: IniConflictOccurrence, side: ConflictKeepSide): string | null {
  if (side === "saved") return conflict.loaded;
  if (side === "file") return conflict.disk;
  return conflict.local;
}

/** A null YARK value is a delete only when the draft said so. A failed print cannot be kept. */
export function canKeepConflictSide(conflict: IniConflictOccurrence, side: ConflictKeepSide): boolean {
  if (side !== "yark") return true;
  return conflict.local !== null || conflict.removes === true;
}

interface KeptSideTarget {
  fileKey: IniFileKey;
  section: string;
  key: string;
  occurrence: number;
  expectedKeyValues?: readonly string[];
}

function keptSideTarget(conflict: IniConflictOccurrence): KeptSideTarget {
  return {
    fileKey: conflict.fileKey,
    section: conflict.section,
    key: conflict.key,
    occurrence: conflict.occurrence,
    ...(conflict.keyValues !== undefined ? { expectedKeyValues: conflict.keyValues } : {}),
  };
}

/**
 * Write the kept value onto the disk value the review showed.
 * A choice that already matches disk is still a check, so a later edit cannot skip the guard.
 */
export function semanticOpForKeptSide(
  conflict: IniConflictOccurrence,
  side: ConflictKeepSide,
):
  | (KeptSideTarget & {
      kind: "set";
      expectedPreviousValue: string | null;
      nextValue: string;
    })
  | (KeptSideTarget & {
      kind: "unset";
      expectedPreviousValue: string;
    })
  | (KeptSideTarget & {
      kind: "check";
      expectedPreviousValue: string | null;
    })
  | null {
  if (!canKeepConflictSide(conflict, side)) return null;
  const next = keptConflictValue(conflict, side);
  const target = keptSideTarget(conflict);
  if (next === conflict.disk) {
    return { kind: "check", ...target, expectedPreviousValue: conflict.disk };
  }
  if (next === null) {
    if (conflict.disk === null) return { kind: "check", ...target, expectedPreviousValue: null };
    return { kind: "unset", ...target, expectedPreviousValue: conflict.disk };
  }
  return {
    kind: "set",
    ...target,
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
  let next = text;
  if (kept === null) {
    const removes = side === "yark" ? conflict.removes === true : true;
    if (removes) next = removeIniTextValue(text, conflict.section, conflict.key, conflict.occurrence);
  } else {
    next = setIniTextValue(text, conflict.section, conflict.key, kept, conflict.occurrence);
  }
  if (next === text) return payload;
  return conflict.fileKey === "gameUserSettings" ? { ...payload, gameUserSettings: next } : { ...payload, game: next };
}

function conflictChoicePhase(conflict: IniConflictOccurrence, side: ConflictKeepSide): number {
  const next = keptConflictValue(conflict, side);
  if (next === null) return 2;
  if (conflict.disk === null) return 1;
  return 0;
}

/** Apply kept values without letting an earlier delete shift a later occurrence. */
export function payloadWithKeptChoices(
  payload: ServerIniPayload,
  choices: readonly { conflict: IniConflictOccurrence; side: ConflictKeepSide }[],
): ServerIniPayload {
  const ordered = [...choices].sort((left, right) => {
    const file = left.conflict.fileKey.localeCompare(right.conflict.fileKey);
    if (file !== 0) return file;
    const group = `${left.conflict.section}\u001f${left.conflict.key}`
      .toLowerCase()
      .localeCompare(`${right.conflict.section}\u001f${right.conflict.key}`.toLowerCase());
    if (group !== 0) return group;
    const phase = conflictChoicePhase(left.conflict, left.side) - conflictChoicePhase(right.conflict, right.side);
    if (phase !== 0) return phase;
    if (conflictChoicePhase(left.conflict, left.side) === 2) {
      return right.conflict.occurrence - left.conflict.occurrence;
    }
    return left.conflict.occurrence - right.conflict.occurrence;
  });
  let next = payload;
  for (const choice of ordered) next = payloadWithKeptValue(next, choice.conflict, choice.side);
  return next;
}

export function sameStringList(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

const MAX_CONFLICT_OCCURRENCE = 10_000;
const MAX_CONFLICT_NAME_CHARS = 512;
const MAX_CONFLICT_VALUE_CHARS = 100_000;

function conflictText(value: unknown, max: number): string | null {
  if (typeof value !== "string" || value.length > max) return null;
  return value;
}

function conflictSideValue(value: unknown): string | null | undefined {
  if (value === null) return null;
  return conflictText(value, MAX_CONFLICT_VALUE_CHARS);
}

/**
 * One conflict row from an IPC error.
 * Values stay unredacted: the renderer writes the chosen side back, and a redaction marker would replace a real secret.
 */
export function parseIniConflictOccurrence(value: unknown): IniConflictOccurrence | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as IniConflictOccurrence;
  if (row.fileKey !== "game" && row.fileKey !== "gameUserSettings") return null;
  if (row.kind !== "scalar" && row.kind !== "engram" && row.kind !== "crate") return null;
  const section = conflictText(row.section, MAX_CONFLICT_NAME_CHARS);
  const key = conflictText(row.key, MAX_CONFLICT_NAME_CHARS);
  if (section === null || key === null) return null;
  if (!Number.isInteger(row.occurrence) || row.occurrence < 0 || row.occurrence > MAX_CONFLICT_OCCURRENCE) {
    return null;
  }
  const loaded = conflictSideValue(row.loaded);
  const local = conflictSideValue(row.local);
  const disk = conflictSideValue(row.disk);
  if (loaded === undefined || local === undefined || disk === undefined) return null;
  let keyValues: string[] | undefined;
  if (row.keyValues !== undefined) {
    if (!Array.isArray(row.keyValues) || row.keyValues.length > MAX_CONFLICT_OCCURRENCE) return null;
    const values: string[] = [];
    for (const item of row.keyValues) {
      const text = conflictText(item, MAX_CONFLICT_VALUE_CHARS);
      if (text === null) return null;
      values.push(text);
    }
    keyValues = values;
  }
  return {
    kind: row.kind,
    fileKey: row.fileKey,
    section,
    key,
    occurrence: row.occurrence,
    ...(row.removes === true ? { removes: true } : {}),
    loaded,
    local,
    disk,
    ...(keyValues !== undefined ? { keyValues } : {}),
  };
}
