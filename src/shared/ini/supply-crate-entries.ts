/** `ConfigOverrideSupplyCrateItems` rows (PINI-013 / #686). Other loot lines stay as loaded. */

import { isSafeEngramClassName, UNSAFE_ENGRAM_CLASS_MESSAGE } from "./engram-named-entries";
import {
  parseIniComplexEntries,
  printIniComplexNode,
  type IniComplexEntry,
  type IniComplexField,
  type IniComplexTuple,
} from "./ini-complex-value";
import { appendIniTextValue, parseIniTextRows } from "./ini-text";

export const SUPPLY_CRATE_STALE_CODE = "SUPPLY_CRATE_STALE";
const SUPPLY_CRATE_CLASS_ONLY = "Add an item with a weight and a quantity. A class alone can empty the crate.";
const SUPPLY_CRATE_NEEDS_ITEM = "Add an item to this entry.";

const SUPPLY_KEY = "configoverridesupplycrateitems";
const SHOOTER_GAME_MODE = "shootergame.shootergamemode";
const NUMBER_RE = /^(?:\d+\.\d+|\d+|\.\d+)$/;
const ROOT_FIELDS = new Set([
  "supplycrateclassstring",
  "minitemsets",
  "maxitemsets",
  "numitemsetspower",
  "bsetsrandomwithoutreplacement",
  "bappenditemsets",
  "itemsets",
]);
const SET_FIELDS = new Set([
  "setname",
  "minnumitems",
  "maxnumitems",
  "numitemspower",
  "setweight",
  "bitemsrandomwithoutreplacement",
  "itementries",
]);
const ENTRY_FIELDS = new Set([
  "entryweight",
  "itemclassstrings",
  "itemsweights",
  "minquantity",
  "maxquantity",
  "minquality",
  "maxquality",
  "bforceblueprint",
  "chancetobeblueprintoverride",
]);

class SupplyCrateEditError extends Error {
  readonly code = SUPPLY_CRATE_STALE_CODE;

  constructor(message: string) {
    super(message);
    this.name = "SupplyCrateEditError";
  }
}

export interface SupplyCrateItemEntry {
  weight: string;
  classes: string[];
  classWeights: string[];
  minQuantity: string;
  maxQuantity: string;
  minQuality: string;
  maxQuality: string;
  /** `null` when the file omitted the field. */
  forceBlueprint: boolean | null;
  blueprintChance: string;
  /**
   * Loaded from a saved line. Clearing that side stays an error until another
   * number is entered. Omitted from the INI.
   */
  keepMinQuantity?: boolean;
  keepMaxQuantity?: boolean;
}

export interface SupplyCrateItemSet {
  name: string;
  minItems: string;
  maxItems: string;
  numItemsPower: string | null;
  weight: string;
  itemsWithoutReplacement: boolean | null;
  entries: SupplyCrateItemEntry[];
}

export interface SupplyCrateBody {
  className: string;
  minSets: string;
  maxSets: string;
  numItemSetsPower: string | null;
  setsWithoutReplacement: boolean | null;
  append: boolean | null;
  sets: SupplyCrateItemSet[];
}

export interface SupplyCrateRow extends SupplyCrateBody {
  section: string;
  occurrence: number;
  expectedRaw: string;
}

export interface SupplyCrateDraft extends SupplyCrateBody {
  removed: boolean;
}

export interface SupplyCratePendingAdd {
  id: string;
  body: SupplyCrateDraft;
}

interface SupplyCrateReplace {
  kind: "replace";
  section: string;
  occurrence: number;
  expectedRaw: string;
  body: SupplyCrateBody;
}

interface SupplyCrateDelete {
  kind: "delete";
  section: string;
  occurrence: number;
  expectedRaw: string;
  className: string;
}

interface SupplyCrateAppend {
  kind: "append";
  body: SupplyCrateBody;
}

export type SupplyCrateEdit = SupplyCrateReplace | SupplyCrateDelete | SupplyCrateAppend;

export interface SupplyCrateSummary {
  rows: SupplyCrateRow[];
  leftoverCount: number;
}

export function isSupplyCrateEntriesKey(key: string): boolean {
  return key.trim().toLowerCase() === SUPPLY_KEY;
}

export function summarizeSupplyCrates(text: string): SupplyCrateSummary {
  const entries = parseIniComplexEntries(text, "game");
  const rows: SupplyCrateRow[] = [];
  const ownedIds = new Set<string>();
  for (const entry of entries) {
    if (entry.key.toLowerCase() !== SUPPLY_KEY) continue;
    const row = readOwnedRow(entry);
    if (row === null) continue;
    rows.push(row);
    ownedIds.add(rowId(entry.section, entry.occurrence));
  }
  return { rows, leftoverCount: countLeftovers(text, entries, ownedIds) };
}

export function supplyCrateRowKey(row: Pick<SupplyCrateRow, "section" | "occurrence">): string {
  return `${row.section}\u001f${row.occurrence}`;
}

export function draftFromSupplyCrate(row: SupplyCrateRow): SupplyCrateDraft {
  const body = cloneBody(row);
  for (const set of body.sets) {
    for (const entry of set.entries) {
      entry.keepMinQuantity = entry.minQuantity.trim().length > 0;
      entry.keepMaxQuantity = entry.maxQuantity.trim().length > 0;
    }
  }
  return { ...body, removed: false };
}

export function draftForNewCrate(className: string): SupplyCrateDraft {
  return {
    className,
    minSets: "1",
    maxSets: "1",
    numItemSetsPower: null,
    setsWithoutReplacement: true,
    append: false,
    removed: false,
    sets: [
      {
        name: "",
        minItems: "1",
        maxItems: "1",
        numItemsPower: null,
        weight: "1",
        itemsWithoutReplacement: true,
        entries: [blankEntry()],
      },
    ],
  };
}

export function blankSupplyCrateEntry(): SupplyCrateItemEntry {
  return blankEntry();
}

/** Why this crate cannot be written. `null` when it has one valid item. */
export function supplyCrateBodyIssue(body: SupplyCrateBody): string | null {
  const className = body.className.trim();
  if (!isSafeEngramClassName(className)) {
    return className.length === 0 ? "Enter a crate class." : UNSAFE_ENGRAM_CLASS_MESSAGE;
  }
  const counts = wholePair(body.minSets, body.maxSets, "Set count");
  if (counts !== null) return counts;
  const power = optionalNumber(body.numItemSetsPower, "Set quality power");
  if (power !== null) return power;
  let ready = 0;
  for (const set of body.sets) {
    const setIssue = itemSetIssue(set);
    if (setIssue !== null) return setIssue;
    for (const entry of set.entries) {
      const issue = itemEntryIssue(entry);
      if (issue !== null) return issue;
      ready += 1;
    }
  }
  return ready > 0 ? null : SUPPLY_CRATE_CLASS_ONLY;
}

export function reviewSupplyCrateState(
  rows: readonly SupplyCrateRow[],
  drafts: Readonly<Record<string, SupplyCrateDraft>>,
  pending: readonly SupplyCratePendingAdd[],
): { edits: SupplyCrateEdit[]; blocked: boolean } {
  const edits: SupplyCrateEdit[] = [];
  let blocked = false;
  for (const row of rows) {
    const draft = drafts[supplyCrateRowKey(row)];
    if (draft === undefined) continue;
    if (draft.removed) {
      edits.push({
        kind: "delete",
        section: row.section,
        occurrence: row.occurrence,
        expectedRaw: row.expectedRaw,
        className: row.className,
      });
      continue;
    }
    if (canonical(draft) === canonical(row)) continue;
    if (supplyCrateBodyIssue(draft) !== null) {
      blocked = true;
      continue;
    }
    edits.push({
      kind: "replace",
      section: row.section,
      occurrence: row.occurrence,
      expectedRaw: row.expectedRaw,
      body: printableBody(draft),
    });
  }
  for (const item of pending) {
    if (item.body.removed) continue;
    if (supplyCrateBodyIssue(item.body) !== null) {
      blocked = true;
      continue;
    }
    edits.push({ kind: "append", body: printableBody(item.body) });
  }
  return { edits, blocked };
}

/**
 * Reprints or deletes supply-crate lines. An empty edit list returns `text`
 * unchanged. A line whose raw value no longer matches is refused before any
 * splice, so neighbors stay byte-for-byte.
 */
export function applySupplyCrateEdits(text: string, edits: readonly SupplyCrateEdit[]): string {
  if (edits.length === 0) return text;
  assertUnique(edits);
  for (const edit of edits) {
    if (edit.kind === "delete") continue;
    const issue = supplyCrateBodyIssue(edit.body);
    if (issue !== null) throw new Error(issue);
  }
  const lineEdits = edits.filter((edit): edit is SupplyCrateReplace | SupplyCrateDelete => edit.kind !== "append");
  const appends = edits.filter((edit): edit is SupplyCrateAppend => edit.kind === "append");
  let out = lineEdits.length === 0 ? text : applyLineEdits(text, lineEdits);
  for (const edit of appends) {
    const section = lastShooterSection(out) ?? "/Script/ShooterGame.ShooterGameMode";
    out = appendIniTextValue(out, section, "ConfigOverrideSupplyCrateItems", printBody(edit.body));
  }
  return out;
}

function applyLineEdits(text: string, edits: readonly (SupplyCrateReplace | SupplyCrateDelete)[]): string {
  const entries = parseIniComplexEntries(text, "game");
  const replacements: { start: number; end: number; next: string }[] = [];
  for (const edit of edits) {
    const entry = entries.find(
      (item) =>
        item.section.toLowerCase() === edit.section.toLowerCase() &&
        item.key.toLowerCase() === SUPPLY_KEY &&
        item.occurrence === edit.occurrence,
    );
    const className = edit.kind === "delete" ? edit.className : edit.body.className;
    if (entry === undefined || entry.raw !== edit.expectedRaw || readOwnedRow(entry) === null) {
      throw new SupplyCrateEditError(staleMessage(className));
    }
    if (edit.kind === "delete") {
      const bounds = lineBounds(text, entry.range.start, entry.range.end);
      replacements.push({ start: bounds.start, end: bounds.end, next: "" });
      continue;
    }
    replacements.push({ start: entry.range.start, end: entry.range.end, next: printBody(edit.body) });
  }
  replacements.sort((left, right) => right.start - left.start);
  let out = text;
  for (const replacement of replacements) {
    out = `${out.slice(0, replacement.start)}${replacement.next}${out.slice(replacement.end)}`;
  }
  return out;
}

function printBody(body: SupplyCrateBody): string {
  const printed = printableBody(body);
  const fields: IniComplexField[] = [stringField("SupplyCrateClassString", printed.className)];
  pushNumber(fields, "MinItemSets", printed.minSets);
  pushNumber(fields, "MaxItemSets", printed.maxSets);
  pushNumber(fields, "NumItemSetsPower", printed.numItemSetsPower);
  pushBoolean(fields, "bSetsRandomWithoutReplacement", printed.setsWithoutReplacement);
  pushBoolean(fields, "bAppendItemSets", printed.append);
  fields.push({
    name: "ItemSets",
    value: {
      kind: "tuple",
      fields: printed.sets.map((set) => ({ name: null, value: printSet(set) })),
    },
  });
  return printIniComplexNode({ kind: "tuple", fields });
}

function printSet(set: SupplyCrateItemSet): IniComplexTuple {
  const fields: IniComplexField[] = [];
  if (set.name.trim().length > 0) fields.push(stringField("SetName", set.name.trim()));
  pushNumber(fields, "MinNumItems", set.minItems);
  pushNumber(fields, "MaxNumItems", set.maxItems);
  pushNumber(fields, "NumItemsPower", set.numItemsPower);
  pushNumber(fields, "SetWeight", set.weight);
  pushBoolean(fields, "bItemsRandomWithoutReplacement", set.itemsWithoutReplacement);
  fields.push({
    name: "ItemEntries",
    value: {
      kind: "tuple",
      fields: set.entries.map((entry) => ({ name: null, value: printEntry(entry) })),
    },
  });
  return { kind: "tuple", fields };
}

function printEntry(entry: SupplyCrateItemEntry): IniComplexTuple {
  const classes = entry.classes.map((className) => className.trim());
  const fields: IniComplexField[] = [];
  pushNumber(fields, "EntryWeight", entry.weight);
  fields.push({
    name: "ItemClassStrings",
    value: {
      kind: "tuple",
      fields: classes.map((className) => ({
        name: null,
        value: { kind: "scalar", literal: "string", value: className },
      })),
    },
  });
  fields.push({
    name: "ItemsWeights",
    value: {
      kind: "tuple",
      fields: entry.classWeights.map((weight) => ({
        name: null,
        value: { kind: "scalar", literal: "number", value: weight.trim() },
      })),
    },
  });
  pushNumber(fields, "MinQuantity", entry.minQuantity);
  pushNumber(fields, "MaxQuantity", entry.maxQuantity);
  pushNumber(fields, "MinQuality", entry.minQuality);
  pushNumber(fields, "MaxQuality", entry.maxQuality);
  pushBoolean(fields, "bForceBlueprint", entry.forceBlueprint);
  pushNumber(fields, "ChanceToBeBlueprintOverride", entry.blueprintChance);
  return { kind: "tuple", fields };
}

function readOwnedRow(entry: IniComplexEntry): SupplyCrateRow | null {
  if (entry.status !== "supported" || entry.value === null || entry.value.kind !== "tuple") return null;
  const root = namedMap(entry.value);
  if (root === null || !onlyKnown(root, ROOT_FIELDS)) return null;
  const className = readString(root.get("supplycrateclassstring"));
  if (className === null || className === "bad" || !isSafeEngramClassName(className)) return null;
  const minSets = readNumber(root.get("minitemsets"));
  const maxSets = readNumber(root.get("maxitemsets"));
  const numItemSetsPower = readNumber(root.get("numitemsetspower"));
  const setsWithoutReplacement = readBoolean(root.get("bsetsrandomwithoutreplacement"));
  const append = readBoolean(root.get("bappenditemsets"));
  if (
    minSets === "bad" ||
    maxSets === "bad" ||
    numItemSetsPower === "bad" ||
    setsWithoutReplacement === "bad" ||
    append === "bad" ||
    !wholeOrEmpty(minSets) ||
    !wholeOrEmpty(maxSets)
  ) {
    return null;
  }
  const sets = readSets(root.get("itemsets"));
  if (sets === null || !sets.some((set) => set.entries.some((item) => item.classes.length > 0))) return null;
  return {
    section: entry.section,
    occurrence: entry.occurrence,
    expectedRaw: entry.raw,
    className,
    minSets: minSets ?? "",
    maxSets: maxSets ?? "",
    numItemSetsPower,
    setsWithoutReplacement,
    append,
    sets,
  };
}

function readSets(field: IniComplexField | undefined): SupplyCrateItemSet[] | null {
  if (field === undefined) return null;
  const tuples = positionalTuples(field);
  if (tuples === null) return null;
  const sets: SupplyCrateItemSet[] = [];
  for (const tuple of tuples) {
    const map = namedMap(tuple);
    if (map === null || !onlyKnown(map, SET_FIELDS)) return null;
    const name = readString(map.get("setname"));
    const minItems = readNumber(map.get("minnumitems"));
    const maxItems = readNumber(map.get("maxnumitems"));
    const numItemsPower = readNumber(map.get("numitemspower"));
    const weight = readNumber(map.get("setweight"));
    const itemsWithoutReplacement = readBoolean(map.get("bitemsrandomwithoutreplacement"));
    if (
      name === "bad" ||
      minItems === "bad" ||
      maxItems === "bad" ||
      numItemsPower === "bad" ||
      weight === "bad" ||
      itemsWithoutReplacement === "bad" ||
      !wholeOrEmpty(minItems) ||
      !wholeOrEmpty(maxItems)
    ) {
      return null;
    }
    const entries = readEntries(map.get("itementries"));
    if (entries === null) return null;
    sets.push({
      name: name ?? "",
      minItems: minItems ?? "",
      maxItems: maxItems ?? "",
      numItemsPower,
      weight: weight ?? "",
      itemsWithoutReplacement,
      entries,
    });
  }
  return sets;
}

function readEntries(field: IniComplexField | undefined): SupplyCrateItemEntry[] | null {
  if (field === undefined) return [];
  const tuples = positionalTuples(field);
  if (tuples === null) return null;
  const entries: SupplyCrateItemEntry[] = [];
  for (const tuple of tuples) {
    const map = namedMap(tuple);
    if (map === null || !onlyKnown(map, ENTRY_FIELDS)) return null;
    const weight = readNumber(map.get("entryweight"));
    const classes = readClassList(map.get("itemclassstrings"));
    const classWeights = readNumberList(map.get("itemsweights"));
    const minQuantity = readNumber(map.get("minquantity"));
    const maxQuantity = readNumber(map.get("maxquantity"));
    const minQuality = readNumber(map.get("minquality"));
    const maxQuality = readNumber(map.get("maxquality"));
    const forceBlueprint = readBoolean(map.get("bforceblueprint"));
    const blueprintChance = readNumber(map.get("chancetobeblueprintoverride"));
    if (
      weight === "bad" ||
      classes === null ||
      classWeights === null ||
      minQuantity === "bad" ||
      maxQuantity === "bad" ||
      minQuality === "bad" ||
      maxQuality === "bad" ||
      forceBlueprint === "bad" ||
      blueprintChance === "bad"
    ) {
      return null;
    }
    if (classes.length > 0 && classWeights.length !== classes.length) return null;
    entries.push({
      weight: weight ?? "",
      classes,
      classWeights,
      minQuantity: minQuantity ?? "",
      maxQuantity: maxQuantity ?? "",
      minQuality: minQuality ?? "",
      maxQuality: maxQuality ?? "",
      forceBlueprint,
      blueprintChance: blueprintChance ?? "",
    });
  }
  return entries;
}

function printableBody(body: SupplyCrateBody): SupplyCrateBody {
  return {
    ...cloneBody(body),
    className: body.className.trim(),
    sets: body.sets
      .map((set) => ({
        ...set,
        name: set.name.trim(),
        entries: set.entries.map((entry) => ({
          weight: entry.weight.trim(),
          classes: classPairs(entry).map((pair) => pair.className),
          classWeights: classPairs(entry).map((pair) => pair.weight),
          minQuantity: entry.minQuantity.trim(),
          maxQuantity: entry.maxQuantity.trim(),
          minQuality: entry.minQuality.trim(),
          maxQuality: entry.maxQuality.trim(),
          forceBlueprint: entry.forceBlueprint,
          blueprintChance: entry.blueprintChance.trim(),
        })),
      }))
      .filter((set) => set.entries.length > 0),
  };
}

function canonical(body: SupplyCrateBody): string {
  const printed = printableBody(body);
  return JSON.stringify({
    className: printed.className,
    minSets: numKey(printed.minSets),
    maxSets: numKey(printed.maxSets),
    numItemSetsPower: numKey(printed.numItemSetsPower),
    setsWithoutReplacement: printed.setsWithoutReplacement,
    append: printed.append,
    sets: printed.sets.map((set) => ({
      name: set.name,
      minItems: numKey(set.minItems),
      maxItems: numKey(set.maxItems),
      numItemsPower: numKey(set.numItemsPower),
      weight: numKey(set.weight),
      itemsWithoutReplacement: set.itemsWithoutReplacement,
      entries: set.entries.map((entry) => ({
        weight: numKey(entry.weight),
        classes: entry.classes,
        classWeights: entry.classWeights.map((weight) => numKey(weight)),
        minQuantity: numKey(entry.minQuantity),
        maxQuantity: numKey(entry.maxQuantity),
        minQuality: numKey(entry.minQuality),
        maxQuality: numKey(entry.maxQuality),
        forceBlueprint: entry.forceBlueprint,
        blueprintChance: numKey(entry.blueprintChance),
      })),
    })),
  });
}

function itemSetIssue(set: SupplyCrateItemSet): string | null {
  const counts = supplyCrateCountIssue(set.minItems, set.maxItems, "Item count");
  if (counts !== null) return counts;
  const power = optionalNumber(set.numItemsPower, "Item quality power");
  if (power !== null) return power;
  return supplyCrateWeightIssue(set.weight, "Set weight", false);
}

function itemEntryIssue(entry: SupplyCrateItemEntry): string | null {
  const pairs = classPairs(entry);
  if (pairs.length === 0) return SUPPLY_CRATE_NEEDS_ITEM;
  if (pairs.some((pair) => !isSafeEngramClassName(pair.className))) return UNSAFE_ENGRAM_CLASS_MESSAGE;
  const weight = supplyCrateWeightIssue(entry.weight, "Item weight", true);
  if (weight !== null) return weight;
  for (const pair of pairs) {
    const classIssue = supplyCrateWeightIssue(pair.weight, "Class weight", true);
    if (classIssue !== null) return classIssue;
  }
  const quantity = quantityIssue(entry.minQuantity, entry.maxQuantity);
  if (quantity !== null) return quantity;
  const savedQuantity = supplyCrateSavedQuantityIssue(entry);
  if (savedQuantity.min !== null || savedQuantity.max !== null) return savedQuantity.min ?? savedQuantity.max;
  const quality = supplyCrateQualityIssue(entry.minQuality, entry.maxQuality);
  if (quality !== null) return quality;
  return supplyCrateChanceIssue(entry.blueprintChance);
}

/** True when this entry would block save, including one with no item. */
export function supplyCrateEntryHasIssue(entry: SupplyCrateItemEntry): boolean {
  return itemEntryIssue(entry) !== null;
}

/** Shown on an entry that has no item class. */
export function supplyCrateMissingItemIssue(classes: readonly string[]): string | null {
  return classes.some((className) => className.trim().length > 0) ? null : SUPPLY_CRATE_NEEDS_ITEM;
}

/** The set's own fields. An entry error stays on that entry. */
export function supplyCrateSetHasIssue(set: SupplyCrateItemSet): boolean {
  return itemSetIssue(set) !== null;
}

function classPairs(entry: SupplyCrateItemEntry): { className: string; weight: string }[] {
  return entry.classes
    .map((className, index) => ({ className: className.trim(), weight: (entry.classWeights[index] ?? "").trim() }))
    .filter((pair) => pair.className.length > 0);
}

function wholePair(min: string, max: string, label: string): string | null {
  if (!wholeOrEmpty(min) || !wholeOrEmpty(max)) return `${label} must be a whole number from 0 to 9999999.`;
  if (min.trim().length > 0 && max.trim().length > 0 && Number(min) > Number(max)) {
    return `${label} minimum cannot be higher than the maximum.`;
  }
  return null;
}

function quantityIssue(min: string, max: string): string | null {
  if (min.trim().length === 0 && max.trim().length === 0) return "Enter a quantity.";
  return quantityPair(min, max, "Quantity", false);
}

/** Same quantity message the save check uses, so the form can mark those fields. */
export function supplyCrateQuantityIssue(min: string, max: string): string | null {
  return quantityIssue(min, max);
}

/** A saved side that the operator cleared. The field may be empty; save stays blocked. */
export function supplyCrateSavedQuantityIssue(entry: SupplyCrateItemEntry): { min: string | null; max: string | null } {
  const message = "Enter a quantity.";
  return {
    min: entry.keepMinQuantity === true && entry.minQuantity.trim().length === 0 ? message : null,
    max: entry.keepMaxQuantity === true && entry.maxQuantity.trim().length === 0 ? message : null,
  };
}

/** Same weight message the save check uses. Required weights reject an empty box. */
export function supplyCrateWeightIssue(value: string, label: string, required: boolean): string | null {
  const issue = optionalPositive(value, label);
  if (!required) return issue;
  if (value.trim().length === 0 || issue !== null) {
    return issue ?? `Enter ${label === "Class weight" ? "a class weight" : "an item weight"} greater than 0.`;
  }
  return null;
}

/** Whole-number min and max, matching the save check for set and item counts. */
export function supplyCrateCountIssue(min: string, max: string, label: string): string | null {
  return wholePair(min, max, label);
}

/** Quality range. An empty pair is allowed. */
export function supplyCrateQualityIssue(min: string, max: string): string | null {
  return quantityPair(min, max, "Quality", true);
}

/** Blueprint chance from 0 to 1. An empty box is allowed. */
export function supplyCrateChanceIssue(value: string): string | null {
  return chanceIssue(value);
}

/** The set asks for one of each entry and will not repeat one, so every entry is included. */
export function supplyCrateSetIncludesEveryEntry(set: SupplyCrateItemSet): boolean {
  if (set.itemsWithoutReplacement !== true || set.entries.length < 2) return false;
  const count = Number(set.minItems);
  if (!Number.isFinite(count) || count !== Number(set.maxItems) || count !== set.entries.length) return false;
  return set.entries.every(
    (entry) => Number(entry.weight) > 0 && entry.classes.some((className) => className.trim().length > 0),
  );
}

function quantityPair(min: string, max: string, label: string, allowEmpty: boolean): string | null {
  if (allowEmpty && min.trim().length === 0 && max.trim().length === 0) return null;
  if (!numberOrEmpty(min) || !numberOrEmpty(max)) return `${label} must be a number that is 0 or greater.`;
  if (min.trim().length > 0 && max.trim().length > 0 && Number(min) > Number(max)) {
    return `${label} minimum cannot be higher than the maximum.`;
  }
  return null;
}

function chanceIssue(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (!numberOrEmpty(trimmed) || Number(trimmed) > 1) return "Blueprint chance must be from 0 to 1.";
  return null;
}

function optionalNumber(value: string | null, label: string): string | null {
  if (value === null || value.trim().length === 0) return null;
  return numberOrEmpty(value) ? null : `${label} must be a number that is 0 or greater.`;
}

function optionalPositive(value: string, label: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (!numberOrEmpty(trimmed) || Number(trimmed) <= 0) return `${label} must be greater than 0.`;
  return null;
}

function namedMap(node: IniComplexTuple): Map<string, IniComplexField> | null {
  if (node.fields.some((field) => field.name === null)) return null;
  const map = new Map<string, IniComplexField>();
  for (const field of node.fields) {
    const name = field.name!.toLowerCase();
    if (map.has(name)) return null;
    map.set(name, field);
  }
  return map;
}

function onlyKnown(map: Map<string, IniComplexField>, known: ReadonlySet<string>): boolean {
  for (const name of map.keys()) {
    if (!known.has(name)) return false;
  }
  return true;
}

function positionalTuples(field: IniComplexField): IniComplexTuple[] | null {
  if (field.value.kind !== "tuple") return null;
  const tuples: IniComplexTuple[] = [];
  for (const child of field.value.fields) {
    if (child.name !== null || child.value.kind !== "tuple") return null;
    tuples.push(child.value);
  }
  return tuples;
}

function readString(field: IniComplexField | undefined): string | null | "bad" {
  if (field === undefined) return null;
  if (field.value.kind !== "scalar" || (field.value.literal !== "string" && field.value.literal !== "token")) {
    return "bad";
  }
  return field.value.value;
}

function readBoolean(field: IniComplexField | undefined): boolean | null | "bad" {
  if (field === undefined) return null;
  if (field.value.kind !== "scalar" || field.value.literal !== "boolean") return "bad";
  if (field.value.value === "true") return true;
  if (field.value.value === "false") return false;
  return "bad";
}

function readNumber(field: IniComplexField | undefined): string | null | "bad" {
  if (field === undefined) return null;
  if (field.value.kind !== "scalar" || field.value.literal !== "number" || !NUMBER_RE.test(field.value.value)) {
    return "bad";
  }
  const numeric = Number(field.value.value);
  return Number.isFinite(numeric) && numeric >= 0 ? field.value.value : "bad";
}

function readClassList(field: IniComplexField | undefined): string[] | null {
  if (field === undefined) return [];
  if (field.value.kind !== "tuple") return null;
  const classes: string[] = [];
  for (const child of field.value.fields) {
    if (child.name !== null || child.value.kind !== "scalar") return null;
    if (child.value.literal !== "string" && child.value.literal !== "token") return null;
    if (!isSafeEngramClassName(child.value.value)) return null;
    classes.push(child.value.value);
  }
  return classes;
}

function readNumberList(field: IniComplexField | undefined): string[] | null {
  if (field === undefined) return [];
  if (field.value.kind !== "tuple") return null;
  const weights: string[] = [];
  for (const child of field.value.fields) {
    if (child.name !== null) return null;
    const weight = readNumber(child);
    if (weight === null || weight === "bad") return null;
    weights.push(weight);
  }
  return weights;
}

function countLeftovers(text: string, entries: readonly IniComplexEntry[], ownedIds: ReadonlySet<string>): number {
  let count = 0;
  const seen = new Set<string>();
  for (const entry of entries) {
    if (entry.key.toLowerCase() !== SUPPLY_KEY) continue;
    const id = rowId(entry.section, entry.occurrence);
    seen.add(id);
    if (!ownedIds.has(id)) count += 1;
  }
  const occurrence = new Map<string, number>();
  for (const row of parseIniTextRows(text)) {
    if (row.key.toLowerCase() !== SUPPLY_KEY) continue;
    const countKey = row.section.toLowerCase();
    const index = occurrence.get(countKey) ?? 0;
    occurrence.set(countKey, index + 1);
    const id = rowId(row.section, index);
    if (seen.has(id) || row.value.trim().startsWith("(")) continue;
    count += 1;
  }
  return count;
}

function cloneBody(body: SupplyCrateBody): SupplyCrateBody {
  return {
    className: body.className,
    minSets: body.minSets,
    maxSets: body.maxSets,
    numItemSetsPower: body.numItemSetsPower,
    setsWithoutReplacement: body.setsWithoutReplacement,
    append: body.append,
    sets: body.sets.map((set) => ({
      ...set,
      entries: set.entries.map((entry) => ({
        ...entry,
        classes: [...entry.classes],
        classWeights: [...entry.classWeights],
      })),
    })),
  };
}

function blankEntry(): SupplyCrateItemEntry {
  return {
    weight: "1",
    classes: [],
    classWeights: [],
    minQuantity: "",
    maxQuantity: "",
    minQuality: "",
    maxQuality: "",
    forceBlueprint: false,
    blueprintChance: "0",
  };
}

function stringField(name: string, value: string): IniComplexField {
  return { name, value: { kind: "scalar", literal: "string", value } };
}

function pushNumber(fields: IniComplexField[], name: string, value: string | null): void {
  if (value === null || value.trim().length === 0) return;
  fields.push({ name, value: { kind: "scalar", literal: "number", value: value.trim() } });
}

function pushBoolean(fields: IniComplexField[], name: string, value: boolean | null): void {
  if (value === null) return;
  fields.push({ name, value: { kind: "scalar", literal: "boolean", value: value ? "true" : "false" } });
}

function numKey(value: string | null): string {
  if (value === null) return "";
  const trimmed = value.trim();
  if (trimmed.length === 0) return "";
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? String(numeric) : trimmed;
}

function numberOrEmpty(value: string | null): boolean {
  if (value === null) return true;
  const trimmed = value.trim();
  if (trimmed.length === 0) return true;
  if (!NUMBER_RE.test(trimmed)) return false;
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) && numeric >= 0;
}

function wholeOrEmpty(value: string | null): boolean {
  if (!numberOrEmpty(value)) return false;
  if (value === null || value.trim().length === 0) return true;
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric <= 9_999_999;
}

function assertUnique(edits: readonly SupplyCrateEdit[]): void {
  const seen = new Set<string>();
  for (const edit of edits) {
    if (edit.kind === "append") continue;
    const id = `${edit.section.toLowerCase()}\u001f${edit.occurrence}`;
    if (seen.has(id)) throw new SupplyCrateEditError("The same crate line is edited more than once.");
    seen.add(id);
  }
}

function staleMessage(className: string): string {
  return `Crate line ${className} changed on disk after it was loaded. Reload from disk, then save again.`;
}

function rowId(section: string, occurrence: number): string {
  return `${section.toLowerCase()}\u001f${occurrence}`;
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

function isShooterGameMode(section: string): boolean {
  const name = section.trim().toLowerCase();
  return name === SHOOTER_GAME_MODE || name === `/script/${SHOOTER_GAME_MODE}`;
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
