import { describe, expect, it } from "vitest";
import { supplyCrateEditsSchema } from "@shared/ipc/primitives";

const entry = {
  weight: "1",
  classes: ["PrimalItemResource_Metal_C"],
  classWeights: ["1"],
  minQuantity: "1",
  maxQuantity: "2",
  minQuality: "",
  maxQuality: "",
  forceBlueprint: false,
  blueprintChance: "0",
};

const body = {
  className: "SupplyCrate_Level03_C",
  minSets: "1",
  maxSets: "1",
  numItemSetsPower: null,
  setsWithoutReplacement: true,
  append: false,
  sets: [
    {
      name: "Metal",
      minItems: "1",
      maxItems: "1",
      numItemsPower: null,
      weight: "1",
      itemsWithoutReplacement: true,
      entries: [entry],
    },
  ],
};

describe("supplyCrateEditsSchema", () => {
  it("accepts one class weight for each class", () => {
    expect(supplyCrateEditsSchema.safeParse([{ kind: "append", body }]).success).toBe(true);
  });

  it("rejects a class weight that has no class", () => {
    const mismatched = {
      ...body,
      sets: [{ ...body.sets[0], entries: [{ ...entry, classWeights: ["1", "9"] }] }],
    };
    expect(supplyCrateEditsSchema.safeParse([{ kind: "append", body: mismatched }]).success).toBe(false);
  });
});
