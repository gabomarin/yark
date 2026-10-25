import { describe, expect, it } from "vitest";
import { asaItemCatalog, asaItemEntries, lookupAsaItem } from "@shared/asa/asa-item-catalog";

const CLASS_RE = /^[A-Za-z0-9_]+_C$/;

describe("asa-item-catalog", () => {
  it("lists item classes once, with a picker label", () => {
    expect(asaItemCatalog.count).toBe(408);
    expect(asaItemEntries).toHaveLength(408);
    const classes = asaItemEntries.map((entry) => entry.className);
    expect(new Set(classes).size).toBe(408);
    const labels = asaItemEntries.map((entry) => entry.label);
    expect([...labels].sort((left, right) => left.localeCompare(right))).toEqual(labels);
    expect(new Set(labels).size).toBe(408);

    for (const entry of asaItemEntries) {
      expect(entry.className).toMatch(CLASS_RE);
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.label.includes(" · ")).toBe(false);
      expect(entry.className.includes("Character_BP")).toBe(false);
      expect(["resource", "weapon", "armor", "structure", "item"]).toContain(entry.kind);
    }

    expect(lookupAsaItem("primalitemresource_metal_c")).toMatchObject({
      label: "Metal",
      kind: "resource",
    });
    expect(lookupAsaItem("PrimalItemResource_Metal_C")?.maps).toContain("TheIsland_WP");
    expect(lookupAsaItem("PrimalItemConsumable_Berry_Amarberry_C")?.label).toBe("Amarberry");
    expect(lookupAsaItem("PrimalItemResource_Gas_C")?.label).toBe("Congealed Gas");
    expect(lookupAsaItem("PrimalItemArmor_GasBagsSaddle_C")?.label).toBe("Gasbags Saddle");
    expect(lookupAsaItem("PrimalItemArmor_MetalBoots_Cursed_C")?.label).toBe("Flak Boots (Cursed)");
    expect(lookupAsaItem("PrimalItem_NotReal_C")).toBeUndefined();
  });
});
