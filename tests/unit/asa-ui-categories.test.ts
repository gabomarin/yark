import { describe, expect, it } from "vitest";
import {
  asaUiCategoryLabel,
  isKnownVanillaIniSection,
  lookupAsaUiCategory,
  resolveAsaUiCategory,
} from "@shared/asa/asa-setting-ui-categories";
import {
  filterIniRows,
  groupRowsByUiCategory,
  groupSettingReferencesByFileOrder,
  groupSettingReferencesByUiCategory,
  parseIniRows,
} from "@features/server-workspace/iniModel";

describe("asa UI categories", () => {
  it("maps known catalog keys from the pregenerated JSON", () => {
    expect(lookupAsaUiCategory("gameUserSettings", "SessionSettings", "SessionName")).toBe("general");
    expect(lookupAsaUiCategory("gameUserSettings", "ServerSettings", "ActiveMods")).toBe("mods");
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
    expect(resolveAsaUiCategory("gameUserSettings", "ServerSettings", "TotallyUnknownVanillaMiscXYZ")).toBe("other");
    // Custom mod section → Other (last category; nested by section in UI)
    expect(resolveAsaUiCategory("game", "Custom", "TotallyUnknownSettingXYZ")).toBe("other");
    expect(resolveAsaUiCategory("gameUserSettings", "SuperStructures", "SomeModToggle")).toBe("other");
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

  it("groups custom mod sections under Other with per-section subgroups", () => {
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
    expect(groups.at(-1)?.category).toBe("other");
    const other = groups.find((group) => group.category === "other");
    expect(other).toBeDefined();
    expect(other?.rows.map((row) => row.key).sort()).toEqual(
      ["CoolFeature", "EnableSomething", "MaxSlots", "ObscureVanillaLeftoverFlag"].sort(),
    );
    expect(other?.sectionGroups?.map((g) => g.section)).toEqual(["MyAwesomeMod", "ServerSettings", "SuperStructures"]);
    const mods = groups.find((group) => group.category === "mods");
    expect(mods?.rows.map((row) => row.key)).toEqual(["ActiveMods"]);
    expect(mods?.sectionGroups).toBeUndefined();
  });

  it("keeps file order for the visual file-order sort", () => {
    const text = `[SessionSettings]
SessionName=B
[ServerSettings]
XPMultiplier=2
ServerPassword=secret
[SessionSettings]
Port=7777
`;
    const rows = parseIniRows(text).map((row) => ({ ...row, fileKey: "gameUserSettings" as const }));
    const sections = groupSettingReferencesByFileOrder(rows);
    expect(sections.map((section) => section.section)).toEqual(["SessionSettings", "ServerSettings"]);
    expect(sections[0]?.rows.map((row) => row.key)).toEqual(["SessionName", "Port"]);
    expect(sections[1]?.rows.map((row) => row.key)).toEqual(["XPMultiplier", "ServerPassword"]);
  });

  it("keeps encounter order inside each category", () => {
    const text = `[SessionSettings]
SessionName=B
[ServerSettings]
XPMultiplier=2
ServerPassword=secret
[SessionSettings]
Port=7777
`;
    const rows = parseIniRows(text).map((row) => ({ ...row, fileKey: "gameUserSettings" as const }));
    const listed = groupSettingReferencesByUiCategory(rows, "file");
    const named = groupSettingReferencesByUiCategory(rows, "name");

    expect(listed.find((group) => group.category === "general")?.rows.map((row) => row.key)).toEqual([
      "SessionName",
      "ServerPassword",
    ]);
    expect(listed.find((group) => group.category === "rates")?.rows.map((row) => row.key)).toEqual(["XPMultiplier"]);
    expect(listed.find((group) => group.category === "networking")?.rows.map((row) => row.key)).toEqual(["Port"]);
    expect(named.find((group) => group.category === "general")?.rows.map((row) => row.key)).toEqual([
      "ServerPassword",
      "SessionName",
    ]);
  });
});
