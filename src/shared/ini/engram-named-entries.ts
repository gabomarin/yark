/** Named `OverrideNamedEngramEntries` rows (PINI-012 / #684). Other engram lines stay as loaded. */

import {
  parseIniComplexEntries,
  printIniComplexNode,
  type IniComplexEntry,
  type IniComplexField,
  type IniComplexNode,
} from "./ini-complex-value";
import { appendIniTextValue, parseIniTextRows } from "./ini-text";

export const NAMED_ENGRAM_STALE_CODE = "NAMED_ENGRAM_STALE";

const NAMED_KEY = "overridenamedengramentries";
const INDEX_KEY = "overrideengramentries";
const AUTO_UNLOCK_KEY = "bautounlockallengrams";
const ONLY_SPECIFIED_KEY = "bonlyallowspecifiedengrams";
const SHOOTER_GAME_MODE = "shootergame.shootergamemode";

const FIELD_CLASS = "engramclassname";
const FIELD_HIDDEN = "engramhidden";
const FIELD_POINTS = "engrampointscost";
const FIELD_LEVEL = "engramlevelrequirement";
const FIELD_PREREQ = "removeengramprereq";

const OWNED_FIELDS = new Set([FIELD_CLASS, FIELD_HIDDEN, FIELD_POINTS, FIELD_LEVEL, FIELD_PREREQ]);

const CANONICAL_NAME: Record<string, string> = {
  [FIELD_CLASS]: "EngramClassName",
  [FIELD_HIDDEN]: "EngramHidden",
  [FIELD_POINTS]: "EngramPointsCost",
  [FIELD_LEVEL]: "EngramLevelRequirement",
  [FIELD_PREREQ]: "RemoveEngramPreReq",
};

/** Wiki order for fields that were not already on the line. */
const APPEND_ORDER = [FIELD_HIDDEN, FIELD_POINTS, FIELD_LEVEL, FIELD_PREREQ];

const INTEGER_RE = /^(?:0|[1-9]\d{0,6})$/;
const UNSAFE_CLASS_RE = /["\\\r\n,()=;#]/;

export function isSafeEngramClassName(className: string): boolean {
  const trimmed = className.trim();
  return trimmed.length > 0 && !/\s/.test(trimmed) && !UNSAFE_CLASS_RE.test(trimmed);
}

export class NamedEngramEditError extends Error {
  readonly code = NAMED_ENGRAM_STALE_CODE;

  constructor(message: string) {
    super(message);
    this.name = "NamedEngramEditError";
  }
}

export interface NamedEngramRow {
  section: string;
  occurrence: number;
  expectedRaw: string;
  className: string;
  /** `null` when the field is absent. The game then uses its own value. */
  hidden: boolean | null;
  points: string | null;
  level: string | null;
  removePrereq: boolean | null;
  duplicate: boolean;
}

export interface NamedEngramDraft {
  className: string;
  hidden: boolean;
  points: string;
  level: string;
  removePrereq: boolean;
  removed: boolean;
}

export interface NamedEngramReplace {
  kind: "replace";
  section: string;
  occurrence: number;
  expectedRaw: string;
  className: string;
  hidden: boolean | null;
  points: string | null;
  level: string | null;
  removePrereq: boolean | null;
}

export interface NamedEngramDelete {
  kind: "delete";
  section: string;
  occurrence: number;
  expectedRaw: string;
  className: string;
}

export interface NamedEngramAppend {
  kind: "append";
  className: string;
  /** `null` omits the field so the game keeps its own value. */
  hidden: boolean | null;
  points: string | null;
  level: string | null;
  removePrereq: boolean | null;
}

export type NamedEngramEdit = NamedEngramReplace | NamedEngramDelete | NamedEngramAppend;

/** A catalog row the operator added. It is not in the file until Save. */
export interface NamedEngramPendingAdd {
  id: string;
  originClass: string;
  draft: NamedEngramDraft;
  /** When true, Hidden off still counts on an edited allow-list line. New lines never set this. */
  listEngram: boolean;
}

export const NAMED_ENGRAM_CLASS_ONLY =
  "Set a cost, a level, hide it, or remove its prerequisite. A class alone does not change the game.";

/** No cost, level, Hidden, or prerequisite. `hiddenOffCounts` is for an edited allow-list line, not a new one. */
export function pendingEngramLacksEffect(draft: NamedEngramDraft, hiddenOffCounts = false): boolean {
  if (draft.removed || hiddenOffCounts || draft.hidden || draft.removePrereq) return false;
  return draft.points.trim().length === 0 && draft.level.trim().length === 0;
}

export interface NamedEngramSummary {
  rows: NamedEngramRow[];
  /** Index lines, broken lines, and named lines with fields this editor does not own. */
  leftoverCount: number;
  autoUnlockAll: boolean;
  onlySpecified: boolean;
}

export type NamedEngramDraftReview = { ok: true; edit: NamedEngramEdit | null } | { ok: false; reason: string };

export function summarizeNamedEngrams(text: string): NamedEngramSummary {
  const entries = parseIniComplexEntries(text, "game");
  const owned: NamedEngramRow[] = [];
  const ownedIds = new Set<string>();

  for (const entry of entries) {
    if (entry.key.toLowerCase() !== NAMED_KEY) continue;
    const row = readOwnedRow(entry);
    if (row === null) continue;
    owned.push(row);
    ownedIds.add(rowId(entry.section, entry.occurrence));
  }

  const classCounts = new Map<string, number>();
  for (const row of owned) {
    const key = row.className.toLowerCase();
    classCounts.set(key, (classCounts.get(key) ?? 0) + 1);
  }
  for (const row of owned) {
    row.duplicate = (classCounts.get(row.className.toLowerCase()) ?? 0) > 1;
  }

  return {
    rows: owned,
    leftoverCount: countLeftovers(text, entries, ownedIds),
    autoUnlockAll: flagOn(text, AUTO_UNLOCK_KEY),
    onlySpecified: flagOn(text, ONLY_SPECIFIED_KEY),
  };
}

export function namedEngramRowKey(row: Pick<NamedEngramRow, "section" | "occurrence">): string {
  return `${row.section}\u001f${row.occurrence}`;
}

export function reviewNamedEngramDrafts(
  rows: readonly NamedEngramRow[],
  drafts: Readonly<Record<string, NamedEngramDraft>>,
  onlySpecified = false,
): { edits: NamedEngramEdit[]; blocked: boolean } {
  const edits: NamedEngramEdit[] = [];
  let blocked = false;
  for (const row of rows) {
    const draft = drafts[namedEngramRowKey(row)];
    if (draft === undefined) continue;
    const review = reviewNamedEngramDraft(row, draft, onlySpecified);
    if (!review.ok) {
      blocked = true;
      continue;
    }
    if (review.edit !== null) edits.push(review.edit);
  }
  return { edits, blocked };
}

export function draftFromRow(row: NamedEngramRow): NamedEngramDraft {
  return {
    className: row.className,
    hidden: row.hidden === true,
    points: row.points ?? "",
    level: row.level ?? "",
    removePrereq: row.removePrereq === true,
    removed: false,
  };
}

export function draftForNewEngram(className: string): NamedEngramDraft {
  return {
    className,
    hidden: false,
    points: "",
    level: "",
    removePrereq: false,
    removed: false,
  };
}

export function reviewNamedEngramState(
  rows: readonly NamedEngramRow[],
  drafts: Readonly<Record<string, NamedEngramDraft>>,
  pending: readonly NamedEngramPendingAdd[],
  onlySpecified = false,
): { edits: NamedEngramEdit[]; blocked: boolean } {
  const existing = reviewNamedEngramDrafts(rows, drafts, onlySpecified);
  const added = reviewNamedEngramAppends(pending);
  return { edits: [...existing.edits, ...added.edits], blocked: existing.blocked || added.blocked };
}

function reviewNamedEngramAppends(pending: readonly NamedEngramPendingAdd[]): {
  edits: NamedEngramAppend[];
  blocked: boolean;
} {
  const edits: NamedEngramAppend[] = [];
  let blocked = false;
  for (const item of pending) {
    if (item.draft.removed) continue;
    const className = item.draft.className.trim();
    if (className.length === 0 || UNSAFE_CLASS_RE.test(className)) {
      blocked = true;
      continue;
    }
    const pointsReview = reviewInteger(null, item.draft.points, "Points cost");
    if (!pointsReview.ok) {
      blocked = true;
      continue;
    }
    const levelReview = reviewInteger(null, item.draft.level, "Level requirement");
    if (!levelReview.ok) {
      blocked = true;
      continue;
    }
    const hidden = item.draft.hidden ? true : null;
    const removePrereq = item.draft.removePrereq ? true : null;
    if (hidden === null && pointsReview.value === null && levelReview.value === null && removePrereq === null) {
      blocked = true;
      continue;
    }
    edits.push({
      kind: "append",
      className,
      hidden,
      points: pointsReview.value,
      level: levelReview.value,
      removePrereq,
    });
  }
  return { edits, blocked };
}

export function reviewNamedEngramDraft(
  row: NamedEngramRow,
  draft: NamedEngramDraft,
  onlySpecified = false,
): NamedEngramDraftReview {
  if (draft.removed) {
    return {
      ok: true,
      edit: {
        kind: "delete",
        section: row.section,
        occurrence: row.occurrence,
        expectedRaw: row.expectedRaw,
        className: row.className,
      },
    };
  }

  const className = draft.className.trim();
  const classDirty = className !== row.className;
  if (classDirty && (className.length === 0 || UNSAFE_CLASS_RE.test(className))) {
    return { ok: false, reason: "Class name cannot include quotes, commas, or parentheses." };
  }

  const pointsReview = reviewInteger(row.points, draft.points, "Points cost");
  if (!pointsReview.ok) return pointsReview;
  const levelReview = reviewInteger(row.level, draft.level, "Level requirement");
  if (!levelReview.ok) return levelReview;

  const hiddenDirty = (row.hidden ?? false) !== draft.hidden;
  const prereqDirty = (row.removePrereq ?? false) !== draft.removePrereq;
  if (!classDirty && !hiddenDirty && !pointsReview.dirty && !levelReview.dirty && !prereqDirty) {
    return { ok: true, edit: null };
  }
  if (pendingEngramLacksEffect(draft, onlySpecified)) {
    return { ok: false, reason: NAMED_ENGRAM_CLASS_ONLY };
  }

  const keepListed =
    onlySpecified && pointsReview.value === null && levelReview.value === null && !draft.hidden && !draft.removePrereq;
  return {
    ok: true,
    edit: {
      kind: "replace",
      section: row.section,
      occurrence: row.occurrence,
      expectedRaw: row.expectedRaw,
      className,
      hidden: keepListed || !(row.hidden === null && !draft.hidden) ? draft.hidden : null,
      points: pointsReview.value,
      level: levelReview.value,
      removePrereq: row.removePrereq === null && !draft.removePrereq ? null : draft.removePrereq,
    },
  };
}

/**
 * Reprints or deletes named engram lines. An empty edit list returns `text`
 * unchanged. A line whose raw value no longer matches is refused before any
 * splice, so neighbors stay byte-for-byte.
 */
export function applyNamedEngramEdits(text: string, edits: readonly NamedEngramEdit[]): string {
  if (edits.length === 0) return text;
  assertUnique(edits);

  const lineEdits = edits.filter((edit): edit is NamedEngramReplace | NamedEngramDelete => edit.kind !== "append");
  const appends = edits.filter((edit): edit is NamedEngramAppend => edit.kind === "append");
  let out = lineEdits.length === 0 ? text : applyNamedEngramLineEdits(text, lineEdits);
  for (const edit of appends) {
    const section = lastShooterSection(out) ?? "/Script/ShooterGame.ShooterGameMode";
    out = appendIniTextValue(out, section, "OverrideNamedEngramEntries", printAppend(edit));
  }
  return out;
}

function applyNamedEngramLineEdits(text: string, edits: readonly (NamedEngramReplace | NamedEngramDelete)[]): string {
  const entries = parseIniComplexEntries(text, "game");
  const replacements: { start: number; end: number; next: string }[] = [];

  for (const edit of edits) {
    const entry = entries.find(
      (item) =>
        item.section.toLowerCase() === edit.section.toLowerCase() &&
        item.key.toLowerCase() === NAMED_KEY &&
        item.occurrence === edit.occurrence,
    );
    if (entry === undefined || entry.raw !== edit.expectedRaw || readOwnedRow(entry) === null) {
      throw new NamedEngramEditError(staleMessage(edit.className));
    }
    if (edit.kind === "delete") {
      const bounds = lineBounds(text, entry.range.start, entry.range.end);
      replacements.push({ start: bounds.start, end: bounds.end, next: "" });
      continue;
    }
    replacements.push({
      start: entry.range.start,
      end: entry.range.end,
      next: printReplacement(entry, edit),
    });
  }

  replacements.sort((a, b) => b.start - a.start);
  let out = text;
  for (const replacement of replacements) {
    out = `${out.slice(0, replacement.start)}${replacement.next}${out.slice(replacement.end)}`;
  }
  return out;
}

function printReplacement(entry: IniComplexEntry, edit: NamedEngramReplace): string {
  return printIniComplexNode(nextNode(entry, edit));
}

function printAppend(edit: NamedEngramAppend): string {
  const fields: IniComplexField[] = [
    { name: "EngramClassName", value: { kind: "scalar", literal: "string", value: edit.className } },
  ];
  if (edit.hidden !== null) {
    fields.push({
      name: "EngramHidden",
      value: { kind: "scalar", literal: "boolean", value: edit.hidden ? "true" : "false" },
    });
  }
  if (edit.points !== null) {
    fields.push({ name: "EngramPointsCost", value: { kind: "scalar", literal: "number", value: edit.points } });
  }
  if (edit.level !== null) {
    fields.push({
      name: "EngramLevelRequirement",
      value: { kind: "scalar", literal: "number", value: edit.level },
    });
  }
  if (edit.removePrereq !== null) {
    fields.push({
      name: "RemoveEngramPreReq",
      value: { kind: "scalar", literal: "boolean", value: edit.removePrereq ? "true" : "false" },
    });
  }
  return printIniComplexNode({ kind: "tuple", fields });
}

function lastShooterSection(text: string): string | null {
  let found: string | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const match = /^\[(.+)\]$/.exec(raw.trim());
    const name = match?.[1]?.trim();
    if (name !== undefined && isShooterGameMode(name)) found = name;
  }
  return found;
}

function nextNode(entry: IniComplexEntry, edit: NamedEngramReplace): IniComplexNode {
  const original = entry.value;
  if (original === null || original.kind !== "tuple") {
    throw new NamedEngramEditError(staleMessage(edit.className));
  }

  const desired = new Map<string, IniComplexNode>();
  desired.set(FIELD_CLASS, { kind: "scalar", literal: "string", value: edit.className });
  if (edit.hidden !== null) {
    desired.set(FIELD_HIDDEN, { kind: "scalar", literal: "boolean", value: edit.hidden ? "true" : "false" });
  }
  if (edit.points !== null) {
    desired.set(FIELD_POINTS, { kind: "scalar", literal: "number", value: edit.points });
  }
  if (edit.level !== null) {
    desired.set(FIELD_LEVEL, { kind: "scalar", literal: "number", value: edit.level });
  }
  if (edit.removePrereq !== null) {
    desired.set(FIELD_PREREQ, {
      kind: "scalar",
      literal: "boolean",
      value: edit.removePrereq ? "true" : "false",
    });
  }

  const fields: IniComplexField[] = [];
  for (const field of original.fields) {
    const name = field.name?.toLowerCase();
    if (name === undefined) continue;
    const next = desired.get(name);
    if (next === undefined) continue;
    fields.push({ name: field.name, value: next });
    desired.delete(name);
  }
  for (const name of APPEND_ORDER) {
    const next = desired.get(name);
    if (next === undefined) continue;
    fields.push({ name: CANONICAL_NAME[name] ?? name, value: next });
  }
  if (desired.has(FIELD_CLASS)) {
    fields.unshift({ name: CANONICAL_NAME[FIELD_CLASS] ?? "EngramClassName", value: desired.get(FIELD_CLASS)! });
  }
  return { kind: "tuple", fields };
}

function readOwnedRow(entry: IniComplexEntry): NamedEngramRow | null {
  if (entry.status !== "supported" || entry.value === null || entry.value.kind !== "tuple") return null;
  const fields = entry.value.fields;
  if (fields.length === 0 || fields.some((field) => field.name === null)) return null;

  const names = fields.map((field) => field.name!.toLowerCase());
  if (new Set(names).size !== names.length) return null;
  if (names.some((name) => !OWNED_FIELDS.has(name))) return null;

  const byName = new Map(fields.map((field) => [field.name!.toLowerCase(), field]));
  const className = readString(byName.get(FIELD_CLASS));
  const hidden = readBoolean(byName.get(FIELD_HIDDEN));
  const points = readInteger(byName.get(FIELD_POINTS));
  const level = readInteger(byName.get(FIELD_LEVEL));
  const removePrereq = readBoolean(byName.get(FIELD_PREREQ));
  if (className === null || hidden === "bad" || points === "bad" || level === "bad" || removePrereq === "bad") {
    return null;
  }

  return {
    section: entry.section,
    occurrence: entry.occurrence,
    expectedRaw: entry.raw,
    className,
    hidden,
    points,
    level,
    removePrereq,
    duplicate: false,
  };
}

function readString(field: IniComplexField | undefined): string | null {
  if (field === undefined) return null;
  if (field.value.kind !== "scalar" || field.value.literal !== "string") return null;
  const value = field.value.value.trim();
  return value.length > 0 ? value : null;
}

function readBoolean(field: IniComplexField | undefined): boolean | null | "bad" {
  if (field === undefined) return null;
  if (field.value.kind !== "scalar" || field.value.literal !== "boolean") return "bad";
  if (field.value.value === "true") return true;
  if (field.value.value === "false") return false;
  return "bad";
}

function readInteger(field: IniComplexField | undefined): string | null | "bad" {
  if (field === undefined) return null;
  if (field.value.kind !== "scalar" || field.value.literal !== "number") return "bad";
  return INTEGER_RE.test(field.value.value) ? field.value.value : "bad";
}

function countLeftovers(text: string, entries: readonly IniComplexEntry[], ownedIds: ReadonlySet<string>): number {
  let count = 0;
  const seen = new Set<string>();

  for (const entry of entries) {
    const key = entry.key.toLowerCase();
    if (key !== NAMED_KEY && key !== INDEX_KEY) continue;
    const id = rowId(entry.section, entry.occurrence);
    seen.add(`${key}\u001f${id}`);
    if (key === INDEX_KEY || !ownedIds.has(id)) count += 1;
  }

  const occurrence = new Map<string, number>();
  for (const row of parseIniTextRows(text)) {
    const key = row.key.toLowerCase();
    if (key !== NAMED_KEY && key !== INDEX_KEY) continue;
    const countKey = `${row.section.toLowerCase()}\u001f${key}`;
    const index = occurrence.get(countKey) ?? 0;
    occurrence.set(countKey, index + 1);
    const id = rowId(row.section, index);
    if (seen.has(`${key}\u001f${id}`)) continue;
    if (!row.value.trim().startsWith("(")) count += 1;
  }

  return count;
}

function flagOn(text: string, key: string): boolean {
  let on = false;
  for (const row of parseIniTextRows(text)) {
    if (!isShooterGameMode(row.section) || row.key.toLowerCase() !== key) continue;
    on = /^(?:true|1)$/i.test(row.value.trim());
  }
  return on;
}

function isShooterGameMode(section: string): boolean {
  const name = section.trim().toLowerCase();
  return name === SHOOTER_GAME_MODE || name === `/script/${SHOOTER_GAME_MODE}`;
}

function reviewInteger(
  source: string | null,
  draft: string,
  label: string,
): { ok: true; dirty: boolean; value: string | null } | { ok: false; reason: string } {
  const trimmed = draft.trim();
  if (trimmed !== "" && !INTEGER_RE.test(trimmed)) {
    return { ok: false, reason: `${label} must be a whole number from 0 to 9999999.` };
  }
  const value = trimmed === "" ? null : trimmed;
  const dirty = source !== value && !(source !== null && value !== null && Number(source) === Number(value));
  return {
    ok: true,
    dirty,
    value: source !== null && value !== null && Number(source) === Number(value) ? source : value,
  };
}

function assertUnique(edits: readonly NamedEngramEdit[]): void {
  const seen = new Set<string>();
  for (const edit of edits) {
    if (edit.kind === "append") continue;
    const id = `${edit.section.toLowerCase()}\u001f${edit.occurrence}`;
    if (seen.has(id)) {
      throw new NamedEngramEditError("The same engram line is edited more than once.");
    }
    seen.add(id);
  }
}

function staleMessage(className: string): string {
  return `Engram line ${className} changed on disk after it was loaded. Reload from disk, then save again.`;
}

function rowId(section: string, occurrence: number): string {
  return `${section.toLowerCase()}\u001f${occurrence}`;
}

function lineBounds(text: string, start: number, end: number): { start: number; end: number } {
  const previousBreak = text.lastIndexOf("\n", Math.max(0, start - 1));
  const lineStart = previousBreak === -1 ? 0 : previousBreak + 1;
  const newline = text.indexOf("\n", end);
  if (newline !== -1) return { start: lineStart, end: newline + 1 };
  if (lineStart === 0) return { start: 0, end: text.length };
  let cut = lineStart - 1;
  if (text[cut] === "\n" && cut > 0 && text[cut - 1] === "\r") cut -= 1;
  return { start: cut, end: text.length };
}
