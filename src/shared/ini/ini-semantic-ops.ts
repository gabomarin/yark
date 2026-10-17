/**
 * Semantic Set/Unset patches for visual INI Save (PINI-004 / #667).
 *
 * Ops identify file + section + key + occurrence + expected previous value.
 * Apply validates every op against the pre-patch document, then mutates in a
 * safe order so unrelated text/comments/unknown sections stay intact.
 */

import type { IniFileKey, ServerIniPayload } from "../types";
import { isVisuallyEditableIniSetting, lookupAbsencePolicy, lookupSettingOwner } from "./ini-setting-decisions";
import { parseIniTextRows, removeIniTextValue, setIniTextValue } from "./ini-text";

type IniSemanticOpKind = "set" | "unset";

interface IniSemanticOpBase {
  kind: IniSemanticOpKind;
  fileKey: IniFileKey;
  section: string;
  key: string;
  /** 0-based occurrence among live assignments of section+key. */
  occurrence: number;
  /**
   * Value expected at that occurrence before the op.
   * `null` means the occurrence must be absent (insert / already gone).
   */
  expectedPreviousValue: string | null;
}

interface IniSemanticSetOp extends IniSemanticOpBase {
  kind: "set";
  nextValue: string;
}

interface IniSemanticUnsetOp extends IniSemanticOpBase {
  kind: "unset";
}

export type IniSemanticOp = IniSemanticSetOp | IniSemanticUnsetOp;

/** Expected-previous mismatch — overlapping external edit (#667). */
export const INI_SEMANTIC_CONFLICT_CODE = "INI_SEMANTIC_CONFLICT" as const;
/** Profile/system-owned or non-visual key (#659 / #667). */
export const INI_SEMANTIC_OWNERSHIP_CODE = "INI_SEMANTIC_OWNERSHIP" as const;
/** Unset rejected by absence policy (#667). */
export const INI_SEMANTIC_UNSET_FORBIDDEN_CODE = "INI_SEMANTIC_UNSET_FORBIDDEN" as const;
/** Malformed op list (structural). */
const INI_SEMANTIC_INVALID_CODE = "INI_SEMANTIC_INVALID" as const;

type IniSemanticErrorCode =
  | typeof INI_SEMANTIC_CONFLICT_CODE
  | typeof INI_SEMANTIC_OWNERSHIP_CODE
  | typeof INI_SEMANTIC_UNSET_FORBIDDEN_CODE
  | typeof INI_SEMANTIC_INVALID_CODE;

export class IniSemanticPatchError extends Error {
  readonly code: IniSemanticErrorCode;
  readonly op: IniSemanticOp | null;
  readonly actualValue: string | null;

  constructor(
    code: IniSemanticErrorCode,
    message: string,
    options?: { op?: IniSemanticOp | null; actualValue?: string | null },
  ) {
    super(message);
    this.name = "IniSemanticPatchError";
    this.code = code;
    this.op = options?.op ?? null;
    this.actualValue = options?.actualValue ?? null;
  }
}

function textForFile(payload: ServerIniPayload, fileKey: IniFileKey): string {
  return fileKey === "gameUserSettings" ? payload.gameUserSettings : payload.game;
}

function withFileText(payload: ServerIniPayload, fileKey: IniFileKey, next: string): ServerIniPayload {
  return fileKey === "gameUserSettings" ? { ...payload, gameUserSettings: next } : { ...payload, game: next };
}

function groupKey(section: string, key: string): string {
  return `${section.trim().toLowerCase()}\u001f${key.trim().toLowerCase()}`;
}

/** Live value at occurrence, or `null` when that occurrence is absent. */
export function getIniTextValueAt(text: string, section: string, key: string, occurrence: number): string | null {
  const target = Math.max(0, Math.floor(occurrence));
  let matchIndex = 0;
  const sectionLower = section.trim().toLowerCase();
  const keyLower = key.trim().toLowerCase();
  for (const row of parseIniTextRows(text)) {
    if (row.section.toLowerCase() !== sectionLower || row.key.toLowerCase() !== keyLower) {
      continue;
    }
    if (matchIndex === target) {
      return row.value;
    }
    matchIndex += 1;
  }
  return null;
}

function assertOpShape(op: IniSemanticOp): void {
  if (op.section.trim().length === 0 || op.key.trim().length === 0) {
    throw new IniSemanticPatchError(INI_SEMANTIC_INVALID_CODE, "INI semantic op is missing section or key", {
      op,
    });
  }
  if (!Number.isFinite(op.occurrence) || op.occurrence < 0) {
    throw new IniSemanticPatchError(INI_SEMANTIC_INVALID_CODE, "INI semantic op occurrence must be >= 0", {
      op,
    });
  }
  if (op.kind === "set" && typeof op.nextValue !== "string") {
    throw new IniSemanticPatchError(INI_SEMANTIC_INVALID_CODE, "INI Set op requires nextValue", { op });
  }
  if (op.kind === "unset" && op.expectedPreviousValue === null) {
    throw new IniSemanticPatchError(
      INI_SEMANTIC_INVALID_CODE,
      "INI Unset op requires the expected previous value (cannot unset an already-absent key)",
      { op },
    );
  }
}

function assertVisuallyMutable(op: IniSemanticOp): void {
  if (!isVisuallyEditableIniSetting(op.fileKey, op.section, op.key)) {
    const owner = lookupSettingOwner(op.fileKey, op.section, op.key);
    throw new IniSemanticPatchError(
      INI_SEMANTIC_OWNERSHIP_CODE,
      `Cannot change ${op.key} via visual INI Save` +
        (owner === "serverProfile" || owner === "system"
          ? " — edit it in Server Info / Server Settings instead."
          : "."),
      { op },
    );
  }
}

function assertUnsetAllowed(op: IniSemanticUnsetOp): void {
  const absence = lookupAbsencePolicy(op.fileKey, op.section, op.key);
  if (absence === "forbidden") {
    throw new IniSemanticPatchError(
      INI_SEMANTIC_UNSET_FORBIDDEN_CODE,
      `Cannot remove ${op.key} — this setting must stay present.`,
      { op },
    );
  }
  if (absence === "mapsToProfileNull") {
    throw new IniSemanticPatchError(
      INI_SEMANTIC_UNSET_FORBIDDEN_CODE,
      `Cannot remove ${op.key} from the INI — clear it on the Server form instead.`,
      { op },
    );
  }
}

function assertExpectedMatches(op: IniSemanticOp, actual: string | null): void {
  if (actual === op.expectedPreviousValue) {
    return;
  }
  throw new IniSemanticPatchError(
    INI_SEMANTIC_CONFLICT_CODE,
    `${op.key} changed outside YARK since this editor loaded. Reload or resolve the conflict before saving.`,
    { op, actualValue: actual },
  );
}

/** Append `key=value` inside an existing section (new trailing duplicate). */
function appendIniTextValue(text: string, section: string, key: string, value: string): string {
  const lines = text.split(/\r?\n/);
  const sectionLower = section.toLowerCase();
  let currentSection = "(root)";
  let lastKeyLineInSection = -1;
  let sectionHeaderIndex = -1;
  let sectionEndIndex = -1;

  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = (lines[index] ?? "").trim();
    const sectionMatch = /^\[(.+)\]$/.exec(trimmed);
    if (sectionMatch !== null) {
      if (currentSection.toLowerCase() === sectionLower && sectionEndIndex < 0) {
        sectionEndIndex = index;
      }
      currentSection = (sectionMatch[1] ?? "(root)").trim();
      if (currentSection.toLowerCase() === sectionLower) {
        sectionHeaderIndex = index;
        lastKeyLineInSection = index;
      }
      continue;
    }
    if (currentSection.toLowerCase() !== sectionLower) {
      continue;
    }
    if (trimmed.length > 0 && !trimmed.startsWith(";") && !trimmed.startsWith("#")) {
      lastKeyLineInSection = index;
    }
  }
  if (currentSection.toLowerCase() === sectionLower && sectionEndIndex < 0) {
    sectionEndIndex = lines.length;
  }

  if (sectionHeaderIndex < 0) {
    return setIniTextValue(text, section, key, value, 0);
  }

  const insertAt = lastKeyLineInSection >= sectionHeaderIndex ? lastKeyLineInSection + 1 : sectionHeaderIndex + 1;
  const next = [...lines];
  next.splice(insertAt, 0, `${key}=${value}`);
  let out = next.join("\n");
  if (!out.endsWith("\n")) {
    out += "\n";
  }
  return out;
}

function applyOneOpToText(text: string, op: IniSemanticOp): string {
  if (op.kind === "unset") {
    return removeIniTextValue(text, op.section, op.key, op.occurrence);
  }

  const actual = getIniTextValueAt(text, op.section, op.key, op.occurrence);
  if (actual === null && op.expectedPreviousValue === null) {
    if (op.occurrence === 0) {
      return setIniTextValue(text, op.section, op.key, op.nextValue, 0);
    }
    return appendIniTextValue(text, op.section, op.key, op.nextValue);
  }
  return setIniTextValue(text, op.section, op.key, op.nextValue, op.occurrence);
}

/**
 * Sort so Unsets remove high occurrences first (stable indices), then Sets.
 * Inserts (expectedPrevious null) run last within a key group.
 */
function sortOpsForApply(ops: readonly IniSemanticOp[]): IniSemanticOp[] {
  return [...ops].sort((a, b) => {
    const fileCmp = a.fileKey.localeCompare(b.fileKey);
    if (fileCmp !== 0) return fileCmp;
    const groupCmp = groupKey(a.section, a.key).localeCompare(groupKey(b.section, b.key));
    if (groupCmp !== 0) return groupCmp;
    if (a.kind !== b.kind) {
      return a.kind === "unset" ? -1 : 1;
    }
    if (a.kind === "unset" && b.kind === "unset") {
      return b.occurrence - a.occurrence;
    }
    const aInsert = a.kind === "set" && a.expectedPreviousValue === null ? 1 : 0;
    const bInsert = b.kind === "set" && b.expectedPreviousValue === null ? 1 : 0;
    if (aInsert !== bInsert) return aInsert - bInsert;
    return a.occurrence - b.occurrence;
  });
}

/**
 * Apply validated semantic ops to a payload.
 * All expected-previous checks use the pre-patch document; then mutations run
 * in a safe order. Throws {@link IniSemanticPatchError} on conflict / policy.
 */
export function applyIniSemanticOps(payload: ServerIniPayload, ops: readonly IniSemanticOp[]): ServerIniPayload {
  if (ops.length === 0) {
    return payload;
  }

  for (const op of ops) {
    assertOpShape(op);
    assertVisuallyMutable(op);
    if (op.kind === "unset") {
      assertUnsetAllowed(op);
    }
    const text = textForFile(payload, op.fileKey);
    const actual = getIniTextValueAt(text, op.section, op.key, op.occurrence);
    assertExpectedMatches(op, actual);
  }

  let next = payload;
  for (const op of sortOpsForApply(ops)) {
    const text = textForFile(next, op.fileKey);
    next = withFileText(next, op.fileKey, applyOneOpToText(text, op));
  }
  return next;
}

/** Align draft duplicates to baseline (equal-first, then order). */
function alignIniDuplicateValuesForOps(
  draftValues: readonly string[],
  baselineValues: readonly string[],
): { matched: (string | null)[]; unusedBaseline: Array<{ occurrence: number; value: string }> } {
  const matched: (string | null)[] = Array.from({ length: draftValues.length }, () => null);
  const usedBaseline = new Set<number>();

  for (let i = 0; i < draftValues.length; i++) {
    if (i < baselineValues.length && draftValues[i] === baselineValues[i]) {
      matched[i] = baselineValues[i] ?? null;
      usedBaseline.add(i);
    }
  }

  for (let i = 0; i < draftValues.length; i++) {
    if (matched[i] !== null) continue;
    const j = baselineValues.findIndex((value, idx) => !usedBaseline.has(idx) && value === draftValues[i]);
    if (j >= 0) {
      matched[i] = baselineValues[j] ?? null;
      usedBaseline.add(j);
    }
  }

  const remainingBaseline = baselineValues
    .map((value, idx) => ({ value, idx }))
    .filter((entry) => !usedBaseline.has(entry.idx));
  let remainingCursor = 0;
  for (let i = 0; i < draftValues.length; i++) {
    if (matched[i] !== null) continue;
    if (remainingCursor < remainingBaseline.length) {
      matched[i] = remainingBaseline[remainingCursor]?.value ?? null;
      usedBaseline.add(remainingBaseline[remainingCursor]?.idx ?? -1);
      remainingCursor += 1;
    }
  }

  const unusedBaseline = baselineValues
    .map((value, occurrence) => ({ occurrence, value }))
    .filter((entry) => !usedBaseline.has(entry.occurrence));

  return { matched, unusedBaseline };
}

/**
 * Build Set/Unset ops for visually editable rows that differ between baseline
 * (load / last save) and the current draft. Revert stays draft-only — callers
 * must not emit Unset for per-row revert.
 */
export function buildIniSemanticOps(baseline: ServerIniPayload, draft: ServerIniPayload): IniSemanticOp[] {
  const ops: IniSemanticOp[] = [];
  const fileKeys: IniFileKey[] = ["gameUserSettings", "game"];

  for (const fileKey of fileKeys) {
    const draftRows = parseIniTextRows(textForFile(draft, fileKey)).filter((row) =>
      isVisuallyEditableIniSetting(fileKey, row.section, row.key),
    );
    const baselineRows = parseIniTextRows(textForFile(baseline, fileKey)).filter((row) =>
      isVisuallyEditableIniSetting(fileKey, row.section, row.key),
    );

    const baselineByGroup = new Map<string, Array<{ section: string; key: string; value: string }>>();
    for (const row of baselineRows) {
      const group = groupKey(row.section, row.key);
      const list = baselineByGroup.get(group) ?? [];
      list.push({ section: row.section, key: row.key, value: row.value });
      baselineByGroup.set(group, list);
    }

    const draftByGroup = new Map<string, Array<{ section: string; key: string; value: string }>>();
    for (const row of draftRows) {
      const group = groupKey(row.section, row.key);
      const list = draftByGroup.get(group) ?? [];
      list.push({ section: row.section, key: row.key, value: row.value });
      draftByGroup.set(group, list);
    }

    const groups = new Set([...baselineByGroup.keys(), ...draftByGroup.keys()]);
    for (const group of groups) {
      const draftEntries = draftByGroup.get(group) ?? [];
      const baselineEntries = baselineByGroup.get(group) ?? [];
      const { matched, unusedBaseline } = alignIniDuplicateValuesForOps(
        draftEntries.map((entry) => entry.value),
        baselineEntries.map((entry) => entry.value),
      );

      for (let occurrence = 0; occurrence < draftEntries.length; occurrence++) {
        const entry = draftEntries[occurrence];
        if (entry === undefined) continue;
        const expected = matched[occurrence] ?? null;
        if (expected === entry.value) continue;
        ops.push({
          kind: "set",
          fileKey,
          section: entry.section,
          key: entry.key,
          occurrence,
          expectedPreviousValue: expected,
          nextValue: entry.value,
        });
      }

      for (const removed of unusedBaseline) {
        const baselineEntry = baselineEntries[removed.occurrence];
        if (baselineEntry === undefined) continue;
        ops.push({
          kind: "unset",
          fileKey,
          section: baselineEntry.section,
          key: baselineEntry.key,
          occurrence: removed.occurrence,
          expectedPreviousValue: removed.value,
        });
      }
    }
  }

  return ops;
}
