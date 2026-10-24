import { describe, expect, it } from "vitest";
import { supplyCrateFit } from "@shared/asa/asa-supply-crate-catalog";
import {
  applySupplyCrateEdits,
  blankSupplyCrateEntry,
  draftForNewCrate,
  draftFromSupplyCrate,
  reviewSupplyCrateState,
  summarizeSupplyCrates,
  supplyCrateChanceIssue,
  supplyCrateClassWeightsFor,
  supplyCrateCountIssue,
  supplyCrateEntryHasIssue,
  supplyCrateMissingItemIssue,
  supplyCrateQualityIssue,
  supplyCrateRowKey,
  supplyCrateSavedQuantityIssue,
  supplyCrateSetHasIssue,
  supplyCrateSetIncludesEveryEntry,
  supplyCrateWeightIssue,
  type SupplyCrateBody,
  type SupplyCrateDraft,
} from "@shared/ini/supply-crate-entries";
import { simulateSupplyCrate, openSupplyCrate, supplyCrateRollIgnoresPower } from "@shared/ini/supply-crate-simulator";

const SECTION = "[/Script/ShooterGame.ShooterGameMode]";
const WHITE =
  'ConfigOverrideSupplyCrateItems=(SupplyCrateClassString="SupplyCrate_Level03_C",MinItemSets=1,MaxItemSets=1,NumItemSetsPower=1.0,bSetsRandomWithoutReplacement=true,bAppendItemSets=false,ItemSets=((SetName="Metal",MinNumItems=1,MaxNumItems=1,NumItemsPower=1.0,SetWeight=1.0,bItemsRandomWithoutReplacement=true,ItemEntries=((EntryWeight=1.0,ItemClassStrings=("PrimalItemResource_Metal_C"),ItemsWeights=(1.0),MinQuantity=1.0,MaxQuantity=2.0,MinQuality=1.0,MaxQuality=1.0,bForceBlueprint=false,ChanceToBeBlueprintOverride=0.0)))))';
const CAVE =
  'ConfigOverrideSupplyCrateItems=(SupplyCrateClassString="SupplyCrate_Cave_QualityTier1_C",MinItemSets=1,MaxItemSets=1,bSetsRandomWithoutReplacement=true,bAppendItemSets=false,ItemSets=((SetWeight=1.0,bItemsRandomWithoutReplacement=true,ItemEntries=((EntryWeight=1.0,ItemClassStrings=("PrimalItemResource_Crystal_C"),ItemsWeights=(1.0),MinQuantity=1.0,MaxQuantity=1.0)))))';

function game(lines: string[]): string {
  return `${SECTION}\n${lines.join("\n")}\n`;
}

function draftsFor(text: string): {
  rows: ReturnType<typeof summarizeSupplyCrates>["rows"];
  drafts: Record<string, SupplyCrateDraft>;
} {
  const rows = summarizeSupplyCrates(text).rows;
  const drafts: Record<string, SupplyCrateDraft> = {};
  for (const row of rows) drafts[supplyCrateRowKey(row)] = draftFromSupplyCrate(row);
  return { rows, drafts };
}

describe("summarizeSupplyCrates", () => {
  it("reads a crate line and leaves class-only, unknown, and broken lines as written", () => {
    const summary = summarizeSupplyCrates(
      game([
        WHITE,
        'ConfigOverrideSupplyCrateItems=(SupplyCrateClassString="SupplyCrate_Level15_C")',
        'ConfigOverrideSupplyCrateItems=(SupplyCrateClassString="SupplyCrate_Level25_C",bAppendPreventIncreasingMinMaxItemSets=true)',
        "ConfigOverrideSupplyCrateItems=not-a-tuple",
      ]),
    );

    expect(summary.rows.map((row) => row.className)).toEqual(["SupplyCrate_Level03_C"]);
    expect(summary.rows[0]?.sets[0]?.entries[0]?.classes).toEqual(["PrimalItemResource_Metal_C"]);
    expect(summary.rows[0]?.numItemSetsPower).toBe("1.0");
    expect(summary.leftoverCount).toBe(3);
  });
});

describe("applySupplyCrateEdits", () => {
  it("reprints one changed line and leaves the next line as written", () => {
    const text = game([WHITE, CAVE]);
    const { rows, drafts } = draftsFor(text);
    const white = rows[0];
    expect(white).toBeDefined();
    if (white === undefined) return;
    const draft = drafts[supplyCrateRowKey(white)];
    expect(draft).toBeDefined();
    if (draft === undefined) return;
    const entry = draft.sets[0]?.entries[0];
    expect(entry).toBeDefined();
    if (entry === undefined) return;
    entry.maxQuantity = "4";

    const review = reviewSupplyCrateState(rows, drafts, []);
    expect(review.blocked).toBe(false);
    expect(review.edits).toHaveLength(1);
    const next = applySupplyCrateEdits(text, review.edits);

    expect(next).toContain("MaxQuantity=4");
    expect(next).toContain(CAVE);
    expect(next).not.toContain("MaxQuantity=2.0");
  });

  it("refuses a save when that line changed on disk", () => {
    const text = game([WHITE]);
    const { rows } = draftsFor(text);
    const row = rows[0];
    expect(row).toBeDefined();
    if (row === undefined) return;
    expect(() =>
      applySupplyCrateEdits(game([WHITE.replace("MaxQuantity=2.0", "MaxQuantity=9.0")]), [
        {
          kind: "replace",
          section: row.section,
          occurrence: row.occurrence,
          expectedRaw: row.expectedRaw,
          body: draftFromSupplyCrate(row),
        },
      ]),
    ).toThrow(/changed on disk/);
  });

  it("deletes the override line and leaves the other crate", () => {
    const text = game([WHITE, CAVE]);
    const { rows, drafts } = draftsFor(text);
    const white = rows[0];
    expect(white).toBeDefined();
    if (white === undefined) return;
    const draft = drafts[supplyCrateRowKey(white)];
    expect(draft).toBeDefined();
    if (draft === undefined) return;
    draft.removed = true;
    const next = applySupplyCrateEdits(text, reviewSupplyCrateState(rows, drafts, []).edits);
    expect(next).not.toContain("SupplyCrate_Level03_C");
    expect(next).toContain(CAVE);
  });
});

describe("reviewSupplyCrateState", () => {
  it("refuses a class-only crate", () => {
    const pending = draftForNewCrate("SupplyCrate_Level03_C");
    const review = reviewSupplyCrateState([], {}, [{ id: "new", body: pending }]);
    expect(review.blocked).toBe(true);
    expect(review.edits).toEqual([]);
  });

  it("keeps every crate when the map changes until one is chosen", () => {
    const text = game([WHITE, CAVE]);
    const { rows, drafts } = draftsFor(text);
    expect(reviewSupplyCrateState(rows, drafts, []).edits).toEqual([]);
    expect(rows.map((row) => supplyCrateFit(row.className, "ScorchedEarth_WP"))).toEqual(["unused", "unused"]);

    const cave = rows[1];
    expect(cave).toBeDefined();
    if (cave === undefined) return;
    const caveDraft = drafts[supplyCrateRowKey(cave)];
    expect(caveDraft).toBeDefined();
    if (caveDraft === undefined) return;
    caveDraft.removed = true;
    const review = reviewSupplyCrateState(rows, drafts, []);
    expect(review.edits.map((edit) => (edit.kind === "delete" ? edit.className : ""))).toEqual([
      "SupplyCrate_Cave_QualityTier1_C",
    ]);
  });
});

describe("simulateSupplyCrate", () => {
  it("replays a seeded roll and keeps one class on the whole quantity", () => {
    const body: SupplyCrateBody = {
      ...draftForNewCrate("SupplyCrate_Level03_C"),
      sets: [
        {
          name: "Metal",
          minItems: "1",
          maxItems: "1",
          numItemsPower: null,
          weight: "1",
          itemsWithoutReplacement: true,
          entries: [
            {
              weight: "1",
              classes: ["PrimalItemResource_Metal_C"],
              classWeights: ["1"],
              minQuantity: "2",
              maxQuantity: "2",
              minQuality: "1",
              maxQuality: "1",
              forceBlueprint: false,
              blueprintChance: "0",
            },
          ],
        },
      ],
    };
    const first = simulateSupplyCrate(body, { seed: 7, rolls: 10 });
    const second = simulateSupplyCrate(body, { seed: 7, rolls: 10 });
    expect(second).toEqual(first);
    expect(first.incomplete).toBe(false);
    expect(first.shortfall).toBe(false);
    expect(first.classes).toEqual([
      { className: "PrimalItemResource_Metal_C", appearances: 10, meanQuantity: 2, blueprintCount: 0 },
    ]);
    expect(simulateSupplyCrate({ ...body, append: true }, { seed: 7, rolls: 1 }).incomplete).toBe(true);
    expect(openSupplyCrate(body, 7).items).toEqual([
      { className: "PrimalItemResource_Metal_C", quantity: 2, blueprints: 0 },
    ]);
    expect(openSupplyCrate(body, 7)).toEqual(openSupplyCrate(body, 7));
  });
});

describe("supplyCrateSetIncludesEveryEntry", () => {
  const entry = (className: string, weight = "1"): SupplyCrateBody["sets"][number]["entries"][number] => ({
    weight,
    classes: className.length === 0 ? [] : [className],
    classWeights: ["1"],
    minQuantity: "1",
    maxQuantity: "1",
    minQuality: "",
    maxQuality: "",
    forceBlueprint: null,
    blueprintChance: "0",
  });

  it("is true when the set asks for one of each entry", () => {
    expect(
      supplyCrateSetIncludesEveryEntry({
        name: "",
        minItems: "2",
        maxItems: "2.0",
        numItemsPower: null,
        weight: "0.1",
        itemsWithoutReplacement: true,
        entries: [entry("PrimalItem_WeaponGun_C"), entry("PrimalItemAmmo_SimpleBullet_C")],
      }),
    ).toBe(true);
  });

  it("is false when an entry can be skipped or repeated", () => {
    const set = {
      name: "",
      minItems: "2",
      maxItems: "2",
      numItemsPower: null,
      weight: "1",
      itemsWithoutReplacement: true,
      entries: [entry("PrimalItemArmor_ClothHelmet_C"), entry("")],
    };
    expect(supplyCrateSetIncludesEveryEntry(set)).toBe(false);
    expect(
      supplyCrateSetIncludesEveryEntry({
        ...set,
        itemsWithoutReplacement: false,
        entries: [entry("A_C"), entry("B_C")],
      }),
    ).toBe(false);
    expect(supplyCrateSetIncludesEveryEntry({ ...set, minItems: "1", entries: [entry("A_C"), entry("B_C")] })).toBe(
      false,
    );
  });
});

describe("supply crate field issues", () => {
  it("uses the save messages for an empty quantity, a zero weight, and a chance above 1", () => {
    expect(supplyCrateWeightIssue("", "Item weight", true)).toBe("Enter an item weight greater than 0.");
    expect(supplyCrateWeightIssue("0", "Set weight", false)).toBe("Set weight must be greater than 0.");
    expect(supplyCrateWeightIssue("", "Set weight", false)).toBeNull();
    expect(supplyCrateCountIssue("3", "1", "Item count")).toBe("Item count minimum cannot be higher than the maximum.");
    expect(supplyCrateQualityIssue("5", "1")).toBe("Quality minimum cannot be higher than the maximum.");
    expect(supplyCrateChanceIssue("2")).toBe("Blueprint chance must be from 0 to 1.");
    expect(supplyCrateChanceIssue("")).toBeNull();
  });

  it("blocks save when a saved quantity is cleared, and leaves that mark off the written line", () => {
    const { rows, drafts } = draftsFor(game([WHITE]));
    const row = rows[0];
    expect(row).toBeDefined();
    if (row === undefined) return;
    const draft = drafts[supplyCrateRowKey(row)];
    const entry = draft?.sets[0]?.entries[0];
    expect(entry?.keepMinQuantity).toBe(true);
    expect(entry?.keepMaxQuantity).toBe(true);
    if (entry === undefined || draft === undefined) return;
    entry.maxQuantity = "";
    expect(supplyCrateSavedQuantityIssue(entry).max).toBe("Enter a quantity.");
    expect(reviewSupplyCrateState(rows, drafts, []).blocked).toBe(true);
    entry.maxQuantity = "9";
    const review = reviewSupplyCrateState(rows, drafts, []);
    expect(review.blocked).toBe(false);
    const edit = review.edits[0];
    expect(edit?.kind).toBe("replace");
    if (edit?.kind !== "replace") return;
    expect(edit.body.sets[0]?.entries[0]).not.toHaveProperty("keepMaxQuantity");
  });

  it("marks only the entry when a saved quantity is cleared, and the set when its own weight is wrong", () => {
    const { rows, drafts } = draftsFor(game([WHITE]));
    const row = rows[0];
    expect(row).toBeDefined();
    if (row === undefined) return;
    const set = drafts[supplyCrateRowKey(row)]?.sets[0];
    const entry = set?.entries[0];
    expect(entry).toBeDefined();
    if (entry === undefined || set === undefined) return;
    expect(supplyCrateEntryHasIssue(entry)).toBe(false);
    expect(supplyCrateSetHasIssue(set)).toBe(false);
    entry.maxQuantity = "";
    expect(supplyCrateEntryHasIssue(entry)).toBe(true);
    expect(supplyCrateSetHasIssue(set)).toBe(false);
    set.weight = "0";
    expect(supplyCrateSetHasIssue(set)).toBe(true);
    set.weight = "1";
    entry.maxQuantity = "2";
    expect(reviewSupplyCrateState(rows, drafts, []).blocked).toBe(false);
    expect(supplyCrateMissingItemIssue(blankSupplyCrateEntry().classes)).toBe("Add an item to this entry.");
    expect(supplyCrateEntryHasIssue(blankSupplyCrateEntry())).toBe(true);
    set.entries = [...set.entries, blankSupplyCrateEntry()];
    expect(reviewSupplyCrateState(rows, drafts, []).blocked).toBe(true);
  });

  it("keeps an empty set when another field on that crate changes", () => {
    const text = game([
      WHITE.replace(
        "ChanceToBeBlueprintOverride=0.0)))))",
        'ChanceToBeBlueprintOverride=0.0))),(SetName="Empty",MinNumItems=0,MaxNumItems=0,SetWeight=1.0,ItemEntries=())))',
      ),
    ]);
    const { rows, drafts } = draftsFor(text);
    const row = rows[0];
    expect(row?.sets).toHaveLength(2);
    if (row === undefined) return;
    const draft = drafts[supplyCrateRowKey(row)];
    const entry = draft?.sets[0]?.entries[0];
    if (draft === undefined || entry === undefined) return;
    entry.maxQuantity = "4";
    const next = applySupplyCrateEdits(text, reviewSupplyCrateState(rows, drafts, []).edits);
    expect(next).toContain('SetName="Empty"');
    expect(next).toContain("MaxQuantity=4");
  });

  it("keeps a class weight with the class that stays", () => {
    expect(supplyCrateClassWeightsFor(["Metal_C", "Crystal_C"], ["2", "5"], ["Crystal_C"])).toEqual(["5"]);
    expect(supplyCrateClassWeightsFor(["Metal_C"], ["2"], ["Metal_C", "Crystal_C"])).toEqual(["2", "1"]);
  });
});

describe("supplyCrateRollIgnoresPower", () => {
  it("is quiet when the power is 1 and notes any other power", () => {
    const even = draftForNewCrate("SupplyCrate_Level03_C");
    expect(supplyCrateRollIgnoresPower(even)).toBe(false);
    expect(supplyCrateRollIgnoresPower({ ...even, numItemSetsPower: "1.0" })).toBe(false);
    expect(supplyCrateRollIgnoresPower({ ...even, numItemSetsPower: "2" })).toBe(true);
  });
});
