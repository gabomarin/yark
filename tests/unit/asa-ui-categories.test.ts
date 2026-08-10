import { describe, expect, it } from "vitest";
import {
  asaUiCategoryLabel,
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

  it("falls back for unknown keys", () => {
    expect(resolveAsaUiCategory("gameUserSettings", "ServerSettings", "BabyImprintingStatScaleMultiplier")).toMatch(
      /breeding|rates|dinos/,
    );
    expect(resolveAsaUiCategory("game", "Custom", "TotallyUnknownSettingXYZ")).toBe("other");
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
});
