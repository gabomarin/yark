import { describe, expect, it } from "vitest";
import { emptyIniFileSelection } from "@shared/config-transfer";
import {
  categorySelectionState,
  fileSelectionState,
  selectedIniKeyIds,
  targetListSelectionState,
  toggleAllTargetIds,
  toggleIniCategoryKeys,
  toggleIniEntireFile,
  toggleIniKey,
  toggleTargetId,
} from "@features/servers/copyConfigurationModel";

const categories = [
  {
    id: "rates",
    label: "Rates",
    keys: [{ section: "ServerSettings", key: "XPMultiplier" }],
  },
  {
    id: "dinos",
    label: "Dinosaurs",
    keys: [
      { section: "ServerSettings", key: "TamingSpeedMultiplier" },
    ],
  },
  {
    id: "general",
    label: "General",
    keys: [{ section: "SessionSettings", key: "MaxPlayers" }],
  },
];

describe("copyConfigurationModel INI selection", () => {
  it("file checkbox selects every key", () => {
    const next = toggleIniEntireFile(
      emptyIniFileSelection("merge"),
      true,
      categories,
    );
    expect(next.enabled).toBe(true);
    expect(next.entireFile).toBe(true);
    expect(selectedIniKeyIds(next, categories).size).toBe(3);
    expect(fileSelectionState(next, categories)).toEqual({
      checked: true,
      indeterminate: false,
    });
  });

  it("UI category checkbox selects only that category", () => {
    let file = toggleIniCategoryKeys(
      emptyIniFileSelection("merge"),
      categories,
      "rates",
      true,
    );
    // Rates is only one of several ServerSettings keys → store as key refs.
    expect(file.sections).toEqual([]);
    expect(file.keys).toEqual([
      { section: "ServerSettings", key: "XPMultiplier" },
    ]);
    expect(selectedIniKeyIds(file, categories).size).toBe(1);
    expect(fileSelectionState(file, categories).indeterminate).toBe(true);
    expect(categorySelectionState(file, categories, "rates").checked).toBe(
      true,
    );

    file = toggleIniCategoryKeys(file, categories, "dinos", true);
    // Now every ServerSettings key in the tree is selected → raw section.
    expect(file.sections).toEqual(["ServerSettings"]);
    expect(selectedIniKeyIds(file, categories).size).toBe(2);

    file = toggleIniKey(
      file,
      categories,
      "ServerSettings",
      "XPMultiplier",
      false,
    );
    expect(selectedIniKeyIds(file, categories).size).toBe(1);
    expect(file.keys).toEqual([
      { section: "ServerSettings", key: "TamingSpeedMultiplier" },
    ]);
  });
});

describe("copyConfigurationModel target multi-select", () => {
  it("toggles individual and select-all targets", () => {
    expect(toggleTargetId([], "a", true)).toEqual(["a"]);
    expect(toggleTargetId(["a"], "b", true)).toEqual(["a", "b"]);
    expect(toggleTargetId(["a", "b"], "a", false)).toEqual(["b"]);
    expect(toggleAllTargetIds(["a"], ["b", "c"], true)).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(toggleAllTargetIds(["a", "b", "c"], ["b", "c"], false)).toEqual([
      "a",
    ]);
    expect(targetListSelectionState(["a"], ["a", "b"])).toEqual({
      checked: false,
      indeterminate: true,
      selectedCount: 1,
    });
  });
});
