/**
 * Lossless complex INI values (PINI-010 / #680).
 *
 * Scalar settings stay on `ini-text.ts` / semantic Set/Unset. This module reads
 * parenthesized tuple and list assignments (loot, spawns, crafting, engrams,
 * stat arrays) and attaches them to the same section + key + occurrence.
 *
 * A semantic value is set only when the shape is supported. Unknown, invalid,
 * and ambiguous entries keep their source text. Diagnostics never rewrite the
 * file. `applyIniComplexEdits` with no edits returns the original string.
 * An edit reprints only the adopted entry.
 */

import type { IniFileKey } from "../types";

/** Same root label as `parseIniTextRows`. */
const INI_ROOT_SECTION = "(root)";

const NUMBER_RE = /^[+-]?(?:\d+\.\d+|\d+|\.\d+)(?:[eE][+-]?\d+)?$/;
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const TOKEN_RE = /^[^ \t\r\n,()="#;]+$/;

export type IniComplexParseStatus = "supported" | "unknown" | "invalid" | "ambiguous";

export type IniComplexDiagnosticCode =
  | "unclosed-tuple"
  | "unclosed-string"
  | "bad-escape"
  | "mixed-fields"
  | "unsupported-structure"
  | "empty-field"
  | "empty-value"
  | "trailing-content"
  | "invalid-field-name";

export interface IniComplexDiagnostic {
  code: IniComplexDiagnosticCode;
  message: string;
  /** Offset in the original file text. */
  offset: number;
}

export interface IniSourceRange {
  /** Inclusive start offset in the original file text. */
  start: number;
  /** Exclusive end offset. */
  end: number;
}

export interface IniComplexScalar {
  kind: "scalar";
  literal: "string" | "number" | "boolean" | "token";
  /**
   * Decoded string contents, `true`/`false`, or the exact number/token spelling.
   * Booleans are lowercase. Numbers keep the source spelling (`1.0` stays `1.0`).
   */
  value: string;
}

export interface IniComplexField {
  /** `null` when the field is positional. */
  name: string | null;
  value: IniComplexNode;
}

export interface IniComplexTuple {
  kind: "tuple";
  fields: IniComplexField[];
}

export type IniComplexNode = IniComplexScalar | IniComplexTuple;

export interface IniComplexEntry {
  fileKey: IniFileKey;
  section: string;
  key: string;
  /** 0-based live occurrence of section+key, same identity as scalar Save. */
  occurrence: number;
  /** Exact source slice `text.slice(range.start, range.end)`. */
  raw: string;
  range: IniSourceRange;
  status: IniComplexParseStatus;
  /** Present only when `status` is `supported`. */
  value: IniComplexNode | null;
  diagnostics: IniComplexDiagnostic[];
}

export interface IniComplexAdopt {
  section: string;
  key: string;
  occurrence: number;
  value: IniComplexNode;
}

export type IniComplexEditErrorCode =
  "INI_COMPLEX_EDIT_TARGET" | "INI_COMPLEX_EDIT_DUPLICATE" | "INI_COMPLEX_EDIT_VALUE" | "INI_COMPLEX_EDIT_INVALID";

export class IniComplexEditError extends Error {
  readonly code: IniComplexEditErrorCode;

  constructor(code: IniComplexEditErrorCode, message: string) {
    super(message);
    this.name = "IniComplexEditError";
    this.code = code;
  }
}

interface TextLine {
  content: string;
  contentStart: number;
}

interface ClassifiedValue {
  status: IniComplexParseStatus;
  value: IniComplexNode | null;
  diagnostics: IniComplexDiagnostic[];
  rawLength: number;
}

type ParseOk<T> = { ok: true; value: T; next: number };
type ParseErr = {
  ok: false;
  status: "unknown" | "invalid" | "ambiguous";
  diagnostic: IniComplexDiagnostic;
  next: number;
};
type ParseStep<T> = ParseOk<T> | ParseErr;

function diagnostic(code: IniComplexDiagnosticCode, message: string, offset: number): IniComplexDiagnostic {
  return { code, message, offset };
}

function splitIniLines(text: string): TextLine[] {
  const lines: TextLine[] = [];
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== "\n") continue;
    const end = index > 0 && text[index - 1] === "\r" ? index - 1 : index;
    lines.push({ content: text.slice(start, end), contentStart: start });
    start = index + 1;
  }
  if (start < text.length) {
    lines.push({ content: text.slice(start), contentStart: start });
  }
  return lines;
}

function isIdentStart(ch: string): boolean {
  return /[A-Za-z_]/.test(ch);
}

function isIdentPart(ch: string): boolean {
  return /[A-Za-z0-9_]/.test(ch);
}

function isTokenChar(ch: string): boolean {
  if (ch === "" || ch === " " || ch === "\t" || ch === "\n" || ch === "\r") return false;
  return !',()="#;'.includes(ch);
}

function skipWs(source: string, index: number): number {
  let next = index;
  while (source[next] === " " || source[next] === "\t") next += 1;
  return next;
}

function isCommentTail(tail: string): boolean {
  let index = 0;
  while (tail[index] === " " || tail[index] === "\t") index += 1;
  const ch = tail[index] ?? "";
  return ch === "" || ch === ";" || ch === "#";
}

/** Index of a `;` or `#` comment that is outside a quoted string, or -1. */
function commentDelimiterOutsideString(source: string): number {
  let inString = false;
  for (let index = 0; index < source.length; index += 1) {
    const ch = source[index] ?? "";
    if (inString) {
      if (ch === "\\") {
        const esc = source[index + 1];
        if (esc === "\\" || esc === '"' || esc === "n" || esc === "r" || esc === "t") index += 1;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === ";" || ch === "#") return index;
  }
  return -1;
}

/** Value span for an unclosed line, leaving an inline comment outside the range. */
function rawLengthBeforeInlineComment(valueText: string): number {
  const commentAt = commentDelimiterOutsideString(valueText);
  if (commentAt < 0) return valueText.length;
  let end = commentAt;
  while (end > 0 && (valueText[end - 1] === " " || valueText[end - 1] === "\t")) end -= 1;
  return end;
}

function classifyToken(raw: string): IniComplexScalar {
  if (/^(true|false)$/i.test(raw)) {
    return { kind: "scalar", literal: "boolean", value: raw.toLowerCase() };
  }
  if (NUMBER_RE.test(raw)) {
    return { kind: "scalar", literal: "number", value: raw };
  }
  return { kind: "scalar", literal: "token", value: raw };
}

function scanTuple(
  source: string,
  base: number,
): { end: number; closed: boolean; diagnostic: IniComplexDiagnostic | null } {
  let depth = 0;
  let inString = false;
  let found: IniComplexDiagnostic | null = null;
  const note = (code: IniComplexDiagnosticCode, message: string, offset: number) => {
    if (found === null) found = diagnostic(code, message, offset);
  };

  for (let index = 0; index < source.length; index += 1) {
    const ch = source[index] ?? "";
    if (inString) {
      if (ch === "\\") {
        const esc = source[index + 1];
        if (esc === "\\" || esc === '"' || esc === "n" || esc === "r" || esc === "t") {
          index += 1;
          continue;
        }
        note("bad-escape", "Quoted string has an escape this parser does not recognize.", base + index);
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "(") {
      depth += 1;
      continue;
    }
    if (ch === ")") {
      depth -= 1;
      if (depth === 0) return { end: index + 1, closed: true, diagnostic: found };
    }
  }

  if (found === null) {
    found = inString
      ? diagnostic("unclosed-string", "Quoted string is missing a closing quote.", base)
      : diagnostic("unclosed-tuple", "Tuple is missing a closing parenthesis.", base);
  }
  return { end: source.length, closed: false, diagnostic: found };
}

function parseStringNode(source: string, start: number, base: number): ParseStep<IniComplexScalar> {
  let index = start + 1;
  let decoded = "";
  while (index < source.length) {
    const ch = source[index] ?? "";
    if (ch === "\\") {
      const esc = source[index + 1];
      if (esc === "\\") decoded += "\\";
      else if (esc === '"') decoded += '"';
      else if (esc === "n") decoded += "\n";
      else if (esc === "r") decoded += "\r";
      else if (esc === "t") decoded += "\t";
      else {
        return {
          ok: false,
          status: "invalid",
          diagnostic: diagnostic(
            "bad-escape",
            "Quoted string has an escape this parser does not recognize.",
            base + index,
          ),
          next: index,
        };
      }
      index += 2;
      continue;
    }
    if (ch === '"') {
      return { ok: true, value: { kind: "scalar", literal: "string", value: decoded }, next: index + 1 };
    }
    decoded += ch;
    index += 1;
  }
  return {
    ok: false,
    status: "invalid",
    diagnostic: diagnostic("unclosed-string", "Quoted string is missing a closing quote.", base + start),
    next: index,
  };
}

function parseTupleNode(source: string, start: number, base: number): ParseStep<IniComplexTuple> {
  let index = skipWs(source, start + 1);
  if ((source[index] ?? "") === ")") {
    return { ok: true, value: { kind: "tuple", fields: [] }, next: index + 1 };
  }

  const fields: IniComplexField[] = [];
  let mode: "named" | "positional" | null = null;
  while (index < source.length) {
    const fieldStart = index;
    const field = parseField(source, index, base);
    if (!field.ok) return field;
    const fieldMode = field.value.name === null ? "positional" : "named";
    if (mode !== null && mode !== fieldMode) {
      return {
        ok: false,
        status: "ambiguous",
        diagnostic: diagnostic("mixed-fields", "Tuple mixes named fields and positional values.", base + fieldStart),
        next: field.next,
      };
    }
    mode = fieldMode;
    fields.push(field.value);
    index = skipWs(source, field.next);
    const nextCh = source[index] ?? "";
    if (nextCh === ",") {
      index = skipWs(source, index + 1);
      if ((source[index] ?? "") === ")") {
        return { ok: true, value: { kind: "tuple", fields }, next: index + 1 };
      }
      continue;
    }
    if (nextCh === ")") {
      return { ok: true, value: { kind: "tuple", fields }, next: index + 1 };
    }
    return {
      ok: false,
      status: "unknown",
      diagnostic: diagnostic("unsupported-structure", "Tuple shape is not a supported list or struct.", base + index),
      next: index,
    };
  }

  return {
    ok: false,
    status: "invalid",
    diagnostic: diagnostic("unclosed-tuple", "Tuple is missing a closing parenthesis.", base + start),
    next: index,
  };
}

function parseField(source: string, start: number, base: number): ParseStep<IniComplexField> {
  const index = skipWs(source, start);
  const ch = source[index] ?? "";
  if (ch === "" || ch === ")" || ch === ",") {
    return {
      ok: false,
      status: "invalid",
      diagnostic: diagnostic("empty-field", "Tuple has an empty field.", base + index),
      next: index,
    };
  }

  if (isIdentStart(ch)) {
    let end = index + 1;
    while (isIdentPart(source[end] ?? "")) end += 1;
    const after = skipWs(source, end);
    if (source[after] === "=") {
      const value = parseNode(source, after + 1, base);
      if (!value.ok) return value;
      return { ok: true, value: { name: source.slice(index, end), value: value.value }, next: value.next };
    }
  } else if (isTokenChar(ch)) {
    let end = index + 1;
    while (isTokenChar(source[end] ?? "")) end += 1;
    const after = skipWs(source, end);
    if (source[after] === "=") {
      return {
        ok: false,
        status: "invalid",
        diagnostic: diagnostic("invalid-field-name", "Field name is not an identifier.", base + index),
        next: after,
      };
    }
  }

  const value = parseNode(source, index, base);
  if (!value.ok) return value;
  return { ok: true, value: { name: null, value: value.value }, next: value.next };
}

function parseNode(source: string, start: number, base: number): ParseStep<IniComplexNode> {
  const index = skipWs(source, start);
  const ch = source[index] ?? "";
  if (ch === "(") return parseTupleNode(source, index, base);
  if (ch === '"') return parseStringNode(source, index, base);
  if (ch === "" || ch === ")" || ch === "," || ch === "=") {
    return {
      ok: false,
      status: "invalid",
      diagnostic: diagnostic("empty-value", "Field is missing a value.", base + index),
      next: index,
    };
  }
  if (!isTokenChar(ch)) {
    return {
      ok: false,
      status: "unknown",
      diagnostic: diagnostic("unsupported-structure", "Tuple shape is not a supported list or struct.", base + index),
      next: index,
    };
  }
  let end = index + 1;
  while (isTokenChar(source[end] ?? "")) end += 1;
  return { ok: true, value: classifyToken(source.slice(index, end)), next: end };
}

function classifyValue(valueText: string, base: number): ClassifiedValue {
  const scan = scanTuple(valueText, base);
  if (!scan.closed) {
    const fallback = diagnostic("unclosed-tuple", "Tuple is missing a closing parenthesis.", base);
    return {
      status: "invalid",
      value: null,
      diagnostics: [scan.diagnostic ?? fallback],
      rawLength: rawLengthBeforeInlineComment(valueText),
    };
  }

  const tail = valueText.slice(scan.end);
  if (scan.diagnostic !== null) {
    const rawLength = isCommentTail(tail) ? scan.end : valueText.length;
    return { status: "invalid", value: null, diagnostics: [scan.diagnostic], rawLength };
  }
  if (!isCommentTail(tail)) {
    return {
      status: "unknown",
      value: null,
      diagnostics: [diagnostic("trailing-content", "Extra text follows the tuple.", base + scan.end)],
      rawLength: valueText.length,
    };
  }

  const parsed = parseTupleNode(valueText.slice(0, scan.end), 0, base);
  if (!parsed.ok) {
    return { status: parsed.status, value: null, diagnostics: [parsed.diagnostic], rawLength: scan.end };
  }
  if (parsed.next !== scan.end) {
    return {
      status: "unknown",
      value: null,
      diagnostics: [
        diagnostic("unsupported-structure", "Tuple shape is not a supported list or struct.", base + parsed.next),
      ],
      rawLength: scan.end,
    };
  }
  return { status: "supported", value: parsed.value, diagnostics: [], rawLength: scan.end };
}

/**
 * Complex assignments in one INI file. Scalars, comments, and blank lines are
 * omitted. Occurrence still counts those live scalar assignments so it matches
 * semantic Save.
 */
export function parseIniComplexEntries(text: string, fileKey: IniFileKey): IniComplexEntry[] {
  const entries: IniComplexEntry[] = [];
  const counts = new Map<string, number>();
  let section = INI_ROOT_SECTION;

  for (const line of splitIniLines(text)) {
    const trimmed = line.content.trim();
    if (trimmed.length === 0 || trimmed.startsWith(";") || trimmed.startsWith("#")) continue;

    const sectionMatch = /^\[(.+)\]$/.exec(trimmed);
    if (sectionMatch !== null) {
      section = sectionMatch[1] ?? INI_ROOT_SECTION;
      continue;
    }

    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (key.length === 0) continue;

    const countKey = `${section.toLowerCase()}\u001f${key.toLowerCase()}`;
    const occurrence = counts.get(countKey) ?? 0;
    counts.set(countKey, occurrence + 1);

    const lead = line.content.length - line.content.trimStart().length;
    let valueLocal = lead + eq + 1;
    while (line.content[valueLocal] === " " || line.content[valueLocal] === "\t") valueLocal += 1;
    if (line.content[valueLocal] !== "(") continue;

    const valueText = line.content.slice(valueLocal);
    const start = line.contentStart + valueLocal;
    const classified = classifyValue(valueText, start);
    const end = start + classified.rawLength;
    entries.push({
      fileKey,
      section,
      key,
      occurrence,
      raw: text.slice(start, end),
      range: { start, end },
      status: classified.status,
      value: classified.value,
      diagnostics: classified.diagnostics,
    });
  }

  return entries;
}

function isBareToken(value: string): boolean {
  if (!TOKEN_RE.test(value)) return false;
  if (/^(true|false)$/i.test(value)) return false;
  if (NUMBER_RE.test(value)) return false;
  return true;
}

function rejectValue(): never {
  throw new IniComplexEditError(
    "INI_COMPLEX_EDIT_VALUE",
    "This value cannot be written as one supported tuple or list.",
  );
}

function assertPrintable(node: IniComplexNode): void {
  if (node.kind === "scalar") {
    if (node.literal === "string") {
      for (const ch of node.value) {
        const code = ch.codePointAt(0) ?? 0;
        if (code < 32 && ch !== "\n" && ch !== "\r" && ch !== "\t") rejectValue();
      }
      return;
    }
    if (node.literal === "boolean" && (node.value === "true" || node.value === "false")) return;
    if (node.literal === "number" && NUMBER_RE.test(node.value)) return;
    if (node.literal === "token" && isBareToken(node.value)) return;
    rejectValue();
  }

  if (node.fields.length === 0) return;
  const named = node.fields.every((field) => field.name !== null);
  const positional = node.fields.every((field) => field.name === null);
  if (!named && !positional) rejectValue();
  for (const field of node.fields) {
    if (field.name !== null && !IDENT_RE.test(field.name)) rejectValue();
    assertPrintable(field.value);
  }
}

function printString(value: string): string {
  let out = '"';
  for (const ch of value) {
    if (ch === "\\") out += "\\\\";
    else if (ch === '"') out += '\\"';
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "\\r";
    else if (ch === "\t") out += "\\t";
    else out += ch;
  }
  return `${out}"`;
}

function printNode(node: IniComplexNode): string {
  if (node.kind === "scalar") {
    return node.literal === "string" ? printString(node.value) : node.value;
  }
  const parts = node.fields.map((field) => {
    const printed = printNode(field.value);
    return field.name === null ? printed : `${field.name}=${printed}`;
  });
  return `(${parts.join(",")})`;
}

/** Canonical text for one supported tree. Throws when the tree is ambiguous or not printable. */
export function printIniComplexNode(node: IniComplexNode): string {
  assertPrintable(node);
  return printNode(node);
}

function assertEditShape(edit: IniComplexAdopt): void {
  if (edit.section.trim().length === 0 || edit.key.trim().length === 0) {
    throw new IniComplexEditError("INI_COMPLEX_EDIT_INVALID", "INI complex edit is missing section or key");
  }
  if (!Number.isInteger(edit.occurrence) || edit.occurrence < 0) {
    throw new IniComplexEditError(
      "INI_COMPLEX_EDIT_INVALID",
      "INI complex edit occurrence must be a whole number >= 0",
    );
  }
}

/**
 * Section text is the header capture, including surrounding spaces (`[ Foo ]`).
 * Keys are stored trimmed. Occurrence is already validated as a whole number.
 */
function editIdentity(edit: IniComplexAdopt): string {
  return `${edit.section.toLowerCase()}\u001f${edit.key.trim().toLowerCase()}\u001f${edit.occurrence}`;
}

/**
 * Reprints adopted entries into `text`. An empty edit list returns `text`
 * unchanged, including line endings, comments, and blank lines. This function
 * does not run client-key sanitation.
 */
export function applyIniComplexEdits(text: string, fileKey: IniFileKey, edits: readonly IniComplexAdopt[]): string {
  if (edits.length === 0) return text;

  for (const edit of edits) assertEditShape(edit);

  const seen = new Set<string>();
  for (const edit of edits) {
    const id = editIdentity(edit);
    if (seen.has(id)) {
      throw new IniComplexEditError(
        "INI_COMPLEX_EDIT_DUPLICATE",
        "The same complex INI entry is edited more than once.",
      );
    }
    seen.add(id);
  }
  for (const edit of edits) assertPrintable(edit.value);

  const entries = parseIniComplexEntries(text, fileKey);
  const replacements: { start: number; end: number; next: string }[] = [];
  for (const edit of edits) {
    const section = edit.section.toLowerCase();
    const key = edit.key.trim().toLowerCase();
    const entry = entries.find(
      (item) =>
        item.section.toLowerCase() === section && item.key.toLowerCase() === key && item.occurrence === edit.occurrence,
    );
    if (entry === undefined) {
      throw new IniComplexEditError(
        "INI_COMPLEX_EDIT_TARGET",
        "No complex INI entry matches this section, key, and occurrence.",
      );
    }
    replacements.push({ start: entry.range.start, end: entry.range.end, next: printNode(edit.value) });
  }

  replacements.sort((a, b) => b.start - a.start);
  let out = text;
  for (const replacement of replacements) {
    out = `${out.slice(0, replacement.start)}${replacement.next}${out.slice(replacement.end)}`;
  }
  return out;
}
