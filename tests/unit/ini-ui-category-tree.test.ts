import { describe, expect, it } from "vitest";
import { listIniUiCategoryTree } from "@shared/ini-ui-category-tree";

describe("listIniUiCategoryTree", () => {
  it("groups GUS keys by ASA UI categories like the INI editor", () => {
    const text = [
      "[ServerSettings]",
      "XPMultiplier=2",
      "TamingSpeedMultiplier=3",
      "ServerAdminPassword=secret",
      "RCONPort=27020",
      "[SessionSettings]",
      "SessionName=Test",
      "MaxPlayers=40",
      "",
    ].join("\n");

    const tree = listIniUiCategoryTree(text, "gameUserSettings", {
      excludeOwnedGusKeys: true,
    });

    const labels = tree.map((c) => c.label);
    expect(labels).toContain("Rates");
    expect(labels).toContain("Dinosaurs");
    // Owned identity keys are excluded
    const allKeys = tree.flatMap((c) => c.keys.map((k) => k.key));
    expect(allKeys).not.toContain("ServerAdminPassword");
    expect(allKeys).not.toContain("RCONPort");
    expect(allKeys).not.toContain("SessionName");
    // Raw INI section headers are not category labels
    expect(labels).not.toContain("ServerSettings");
    expect(labels).not.toContain("[ServerSettings]");
  });

  it("keeps section+key on each leaf for compose", () => {
    const text = "[ServerSettings]\nXPMultiplier=2\n";
    const tree = listIniUiCategoryTree(text, "gameUserSettings");
    const rates = tree.find((c) => c.id === "rates");
    expect(rates?.keys).toEqual([
      { section: "ServerSettings", key: "XPMultiplier" },
    ]);
  });
});
