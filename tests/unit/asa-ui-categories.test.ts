import { describe, expect, it } from "vitest";
import {
  asaUiCategoryLabel,
  isKnownVanillaIniSection,
  lookupAsaUiCategory,
  resolveAsaUiCategory,
} from "@shared/asa-setting-ui-categories";
import {
  filterIniRows,
  groupRowsByUiCategory,
  parseIniRows,
} from "@features/server-workspace/iniModel";

describe("asa UI categories", () => {
  it("maps known catalog keys from the pregenerated JSON", () => {
    expect(
      lookupAsaUiCategory("gameUserSettings", "SessionSettings", "SessionName"),
    ).toBe("general");
    expect(
      lookupAsaUiCategory("gameUserSettings", "ServerSettings", "ActiveMods"),
    ).toBe("mods");
    expect(asaUiCategoryLabel("breeding")).toBe("Breeding");
  });

  it("recognizes stock ASA dedicated-server sections as vanilla", () => {
    expect(isKnownVanillaIniSection("ServerSettings")).toBe(true);
    expect(isKnownVanillaIniSection("/Script/ShooterGame.ShooterGameMode")).toBe(true);
    expect(isKnownVanillaIniSection("SuperStructures")).toBe(false);
    expect(isKnownVanillaIniSection("MyAwesomeMod")).toBe(false);
  });

  it("falls back for unknown keys", () => {
    expect(resolveAsaUiCategory("gameUserSettings", "ServerSettings", "BabyImprintingStatScaleMultiplier")).toMatch(
      /breeding|rates|dinos/,
    );
    // Vanilla section, no heuristic match → Other
    expect(
      resolveAsaUiCategory("gameUserSettings", "ServerSettings", "TotallyUnknownVanillaMiscXYZ"),
    ).toBe("other");
    // Custom mod section → Mods (not Other)
    expect(resolveAsaUiCategory("game", "Custom", "TotallyUnknownSettingXYZ")).toBe("mods");
    expect(
      resolveAsaUiCategory("gameUserSettings", "SuperStructures", "SomeModToggle"),
    ).toBe("mods");
  });

  it("filters and groups editor rows by UI category", () => {
    const text = `[ServerSettings]
SessionName=Test
ActiveMods=1,2
AllowCaveBuildingPvE=True
XPMultiplier=2.0
`;
    const rows = parseIniRows(text);
    const rates = filterIniRows(rows, "", "rates", "gameUserSettings");
    expect(rates.some((row) => row.key === "XPMultiplier")).toBe(true);
    expect(rates.some((row) => row.key === "SessionName")).toBe(false);

    const groups = groupRowsByUiCategory(rows, "gameUserSettings");
    expect(groups.length).toBeGreaterThan(1);
    expect(groups.every((group) => group.rows.length > 0)).toBe(true);
    expect(groups.some((group) => group.category === "general")).toBe(true);
  });

  it("groups custom mod sections under Mods with per-section subgroups", () => {
    const text = `[ServerSettings]
ActiveMods=1,2
ObscureVanillaLeftoverFlag=False
[SuperStructures]
EnableSomething=True
MaxSlots=40
[MyAwesomeMod]
CoolFeature=1
`;
    const rows = parseIniRows(text);
    const groups = groupRowsByUiCategory(rows, "gameUserSettings");
    const mods = groups.find((group) => group.category === "mods");
    expect(mods).toBeDefined();
    expect(mods?.rows.map((row) => row.key).sort()).toEqual(
      ["ActiveMods", "CoolFeature", "EnableSomething", "MaxSlots"].sort(),
    );
    expect(mods?.sectionGroups?.map((g) => g.section)).toEqual([
      "MyAwesomeMod",
      "ServerSettings",
      "SuperStructures",
    ]);
    const other = groups.find((group) => group.category === "other");
    expect(other?.rows.some((row) => row.key === "ObscureVanillaLeftoverFlag")).toBe(true);
    expect(other?.rows.some((row) => row.section === "SuperStructures")).toBeFalsy();
  });
});
