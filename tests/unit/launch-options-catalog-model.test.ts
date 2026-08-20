import { describe, expect, it } from "vitest";
import {
  asaLaunchOptionEntries,
  lookupLaunchOptionById,
} from "@shared/asa-launch-options-catalog";
import {
  CATALOG_STATUS_FILTERS,
  catalogBrowseSecondary,
  catalogStatusFilterTooltip,
  catalogStatusLabel,
  shouldShowCatalogNotes,
  YARK_OWNED_CATALOG_IDS,
  yarkManagedLaunchCopy,
  yarkManagedSurfaceForCatalogId,
} from "@features/servers/components/LaunchOptionsCatalogModal/launchOptionsCatalogModel";

describe("launchOptionsCatalogModel (#381)", () => {
  it("exposes operator tooltips for every browse filter", () => {
    expect(CATALOG_STATUS_FILTERS.map(catalogStatusLabel)).toEqual([
      "All",
      "Supported",
      "Uncertain",
      "YARK-owned",
    ]);
    for (const filter of CATALOG_STATUS_FILTERS) {
      const tooltip = catalogStatusFilterTooltip(filter);
      expect(tooltip.trim().length).toBeGreaterThan(20);
      expect(tooltip).not.toMatch(/extraArgs:/);
    }
    expect(catalogStatusFilterTooltip("all")).toMatch(/unsupported/i);
    expect(catalogStatusFilterTooltip("supported")).toMatch(/Launch tab/);
    expect(catalogStatusFilterTooltip("uncertain")).toMatch(/not sure/i);
    expect(catalogStatusFilterTooltip("yarkOwned")).toMatch(/Extra arguments/);
  });

  it("maps every catalog yarkOwned id to managed-in copy", () => {
    const catalogYarkOwnedIds = asaLaunchOptionEntries
      .filter((entry) => entry.status === "yarkOwned")
      .map((entry) => entry.id)
      .sort();
    expect(catalogYarkOwnedIds).toEqual([...YARK_OWNED_CATALOG_IDS].sort());
    expect(yarkManagedSurfaceForCatalogId("mods")).toBe("Mods");
    expect(yarkManagedSurfaceForCatalogId("port")).toBe("Server settings");
    expect(yarkManagedLaunchCopy("port")).toBe(
      "YARK already sets this from Server settings. Do not add it in Extra arguments.",
    );
    expect(yarkManagedLaunchCopy("mods")).toBe(
      "YARK already sets this from Mods. Do not add it in Extra arguments.",
    );

    for (const id of YARK_OWNED_CATALOG_IDS) {
      const entry = lookupLaunchOptionById(id);
      expect(entry, id).toBeDefined();
      expect(entry!.status).toBe("yarkOwned");
      const secondary = catalogBrowseSecondary(entry!);
      expect(secondary?.kind).toBe("managed");
      if (secondary?.kind !== "managed") return;
      expect(secondary.text).toBe(yarkManagedLaunchCopy(id));
      expect(secondary.text).not.toMatch(/extraArgs:/);
      expect(shouldShowCatalogNotes(entry!)).toBe(false);
    }
  });

  it("throws when a YARK-owned id has no managed-surface mapping", () => {
    expect(() => yarkManagedSurfaceForCatalogId("not-a-mapped-yark-owned")).toThrow(
      /no managed-surface mapping/i,
    );
  });

  it("keeps Conflicts metadata for non–YARK-owned rows", () => {
    expect(
      catalogBrowseSecondary({
        id: "nobattleye",
        status: "supported",
        conflicts: ["extraArgs:-NoBattlEye"],
      }),
    ).toEqual({
      kind: "conflicts",
      items: ["extraArgs:-NoBattlEye"],
    });
    expect(
      catalogBrowseSecondary({
        id: "nobattleye",
        status: "supported",
        conflicts: [],
      }),
    ).toBeNull();
  });
});
