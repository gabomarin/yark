import { describe, expect, it } from "vitest";
import { diffServerIniPayloads } from "@shared/ini/ini-diff";

describe("diffServerIniPayloads", () => {
  it("lists added, removed, and changed keys", () => {
    const before = {
      gameUserSettings: "[ServerSettings]\nXPMultiplier=1\nTamingSpeedMultiplier=2\n",
      game: "",
    };
    const after = {
      gameUserSettings: "[ServerSettings]\nXPMultiplier=3\nExternalEdit=1\n",
      game: "",
    };
    const diff = diffServerIniPayloads(before, after);
    expect(diff).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "XPMultiplier",
          change: "changed",
          before: "1",
          after: "3",
        }),
        expect.objectContaining({ key: "TamingSpeedMultiplier", change: "removed" }),
        expect.objectContaining({ key: "ExternalEdit", change: "added", after: "1" }),
      ]),
    );
  });

  it("reports duplicate-assignment changes even when the last value is unchanged", () => {
    const before = {
      gameUserSettings: "[ServerSettings]\nCustomFlag=2\n",
      game: "",
    };
    const after = {
      gameUserSettings: "[ServerSettings]\nCustomFlag=1\nCustomFlag=2\n",
      game: "",
    };
    const diff = diffServerIniPayloads(before, after);
    expect(diff).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "CustomFlag",
          occurrence: 0,
          change: "changed",
          before: "2",
          after: "1",
        }),
        expect.objectContaining({
          key: "CustomFlag",
          occurrence: 1,
          change: "added",
          after: "2",
        }),
      ]),
    );
  });
});
