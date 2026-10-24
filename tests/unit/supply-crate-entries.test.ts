import { describe, expect, it } from "vitest";
import { supplyCrateFit } from "@shared/asa/asa-supply-crate-catalog";
import {
  applySupplyCrateEdits,
  draftForNewCrate,
  draftFromSupplyCrate,
  reviewSupplyCrateState,
  summarizeSupplyCrates,
  supplyCrateRowKey,
  type SupplyCrateBody,
  type SupplyCrateDraft,
} from "@shared/ini/supply-crate-entries";
import { simulateSupplyCrate } from "@shared/ini/supply-crate-simulator";

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
    expect(rows.map((row) => supplyCrateFit(row.className, "ScorchedEarth_WP"))).toEqual(["shared", "unused"]);

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
  });
});
