import { describe, expect, it } from "vitest";
import {
  assertClusterIniTemplateFileSelection,
  mergeClusterIniPayloadByFileSelection,
} from "@shared/cluster-ini-file-selection";

describe("cluster-ini-file-selection", () => {
  it("defaults omitted selection to both files", () => {
    expect(assertClusterIniTemplateFileSelection()).toEqual({
      gameUserSettings: true,
      game: true,
    });
  });

  it("rejects an empty selection", () => {
    expect(() =>
      assertClusterIniTemplateFileSelection({
        gameUserSettings: false,
        game: false,
      }),
    ).toThrow(/at least one INI file/i);
  });

  it("keeps baseline text for unselected files", () => {
    const merged = mergeClusterIniPayloadByFileSelection(
      { gameUserSettings: "new-gus", game: "new-game" },
      { gameUserSettings: "old-gus", game: "old-game" },
      { gameUserSettings: true, game: false },
    );
    expect(merged).toEqual({
      gameUserSettings: "new-gus",
      game: "old-game",
    });
  });
});
