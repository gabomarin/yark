import { describe, expect, it } from "vitest";
import { supplyCrateCatalog, supplyCrateFit, supplyCrateFitHint } from "@shared/asa/asa-supply-crate-catalog";
import { KNOWN_MAPS } from "@shared/types";

describe("supply crate map fit", () => {
  it("explains a colored drop on a surface map", () => {
    expect(supplyCrateFit("SupplyCrate_Level03_C", "TheIsland_WP")).toBe("shared");
    expect(supplyCrateFitHint("SupplyCrate_Level03_C", "TheIsland_WP")).toBe(
      "Colored drop used on The Island, The Center, Ragnarok, and Valguero. The ring drop is a separate class and keeps the game's loot until you edit it.",
    );
  });

  it("explains a colored drop on Aberration as unused", () => {
    expect(supplyCrateFitHint("SupplyCrate_Level03_C", "Aberration_WP")).toBe(
      "Colored drops are not used on Aberration. This override stays until you remove it.",
    );
  });

  it("explains a cave crate on The Island and on Scorched Earth", () => {
    expect(supplyCrateFitHint("SupplyCrate_Cave_QualityTier1_C", "TheIsland_WP")).toBe(
      "Cave crate used on The Island.",
    );
    expect(supplyCrateFitHint("SupplyCrate_Cave_QualityTier1_C", "ScorchedEarth_WP")).toBe(
      "This cave crate is not used on Scorched Earth. This override stays until you remove it.",
    );
  });

  it("explains a ring drop as its own line", () => {
    expect(supplyCrateFit("SupplyCrate_Level60_Double_C", "TheIsland_WP")).toBe("shared");
    expect(supplyCrateFitHint("SupplyCrate_Level60_Double_C", "TheIsland_WP")).toBe(
      "Ring drop used on The Island, The Center, Ragnarok, and Valguero. The crate without a ring is a separate line and keeps the game's loot until you edit it.",
    );
    expect(supplyCrateFitHint("SupplyCrate_Level03_Double_C", "Aberration_WP")).toBe(
      "Ring drops are not used on Aberration. This override stays until you remove it.",
    );
  });

  it("explains cave crate tier 4 on the same maps as the other cave crates", () => {
    expect(supplyCrateFit("SupplyCrate_Cave_QualityTier4_C", "Ragnarok_WP")).toBe("active");
    expect(supplyCrateFitHint("SupplyCrate_Cave_QualityTier4_C", "Extinction_WP")).toBe(
      "This cave crate is not used on Extinction. This override stays until you remove it.",
    );
  });

  it("names a Scorched Earth drop and the maps that share it", () => {
    expect(supplyCrateFit("SupplyCrate_Level03_ScorchedEarth_C", "ScorchedEarth_WP")).toBe("shared");
    expect(supplyCrateFitHint("SupplyCrate_Level03_ScorchedEarth_C", "ScorchedEarth_WP")).toBe(
      "Scorched Earth white supply crate used on Scorched Earth, Ragnarok, and Valguero. The ring drop is a separate class and keeps the game's loot until you edit it.",
    );
    expect(supplyCrateFit("SupplyCrate_Level03_C", "ScorchedEarth_WP")).toBe("unused");
  });

  it("keeps a crate with no YARK map unknown", () => {
    expect(supplyCrateFit("Fjo_SupplyCrate_Level15_C", "TheIsland_WP")).toBe("unknown");
    expect(supplyCrateFitHint("Fjo_SupplyCrate_Level15_C", "TheIsland_WP")).toBe(
      "Fjordur green supply crate is not tied to a map YARK knows. This override stays until you remove it.",
    );
    expect(supplyCrateFit("SupplyCrate_Gift_C", "TheIsland_WP")).toBe("unknown");
  });

  it("uses the wiki class for the Ragnarok desert crate", () => {
    expect(supplyCrateFit("SupplyCreate_OceanInstant_High_C", "Ragnarok_WP")).toBe("active");
    expect(supplyCrateFitHint("SupplyCreate_OceanInstant_High_C", "TheIsland_WP")).toBe(
      "Ragnarok desert loot crate is not used on The Island. This override stays until you remove it.",
    );
  });

  it("lists each beacon class once, with a map YARK knows", () => {
    const entries = supplyCrateCatalog();
    const classes = new Set(entries.map((entry) => entry.className.toLowerCase()));
    const labels = new Set(entries.map((entry) => entry.label.toLowerCase()));
    const known = new Set<string>(KNOWN_MAPS);
    expect(entries.length).toBe(143);
    expect(classes.size).toBe(entries.length);
    expect(labels.size).toBe(entries.length);
    expect(entries.every((entry) => entry.maps.every((map) => known.has(map)))).toBe(true);
    expect(entries.some((entry) => entry.className === "Lootcrate_lvl1_C")).toBe(true);
    expect(entries.some((entry) => entry.className.startsWith("MissionType_"))).toBe(false);
  });

  it("explains a class outside the list", () => {
    expect(supplyCrateFitHint("SupplyCrate_Custom_C", "TheIsland_WP")).toBe(
      "This class is not in the crate list, or The Island is not a map YARK knows. You can still edit it.",
    );
  });
});
