import { describe, expect, it } from "vitest";
import { getIniTextValueAt } from "@shared/ini/ini-semantic-ops";
import type { IniConflictOccurrence } from "@shared/ini/ini-conflict";
import type { ServerIniPayload } from "@shared/types";
import { payloadAfterConflictAccept, type ConflictChoice } from "./configurationEditorConflict";

function gus(body: string): ServerIniPayload {
  return { gameUserSettings: body.endsWith("\n") ? body : `${body}\n`, game: "" };
}

const xp: IniConflictOccurrence = {
  kind: "scalar",
  fileKey: "gameUserSettings",
  section: "ServerSettings",
  key: "XPMultiplier",
  occurrence: 0,
  loaded: "1",
  local: "6",
  disk: "9",
};

describe("payloadAfterConflictAccept", () => {
  it("keeps unrelated disk edits and draft edits that were not in the review", () => {
    const baseline = gus("[ServerSettings]\nXPMultiplier=1\nDifficultyOffset=1\n");
    const draft = gus("[ServerSettings]\nXPMultiplier=6\nDifficultyOffset=2\n");
    const saved = gus("[ServerSettings]\nXPMultiplier=9\nDifficultyOffset=1\nHarvestAmountMultiplier=2\n");
    const kept: ConflictChoice[] = [{ conflict: xp, side: "file" }];
    const next = payloadAfterConflictAccept(saved, baseline, draft, kept);
    expect(getIniTextValueAt(next.gameUserSettings, "ServerSettings", "XPMultiplier", 0)).toBe("9");
    expect(getIniTextValueAt(next.gameUserSettings, "ServerSettings", "DifficultyOffset", 0)).toBe("2");
    expect(getIniTextValueAt(next.gameUserSettings, "ServerSettings", "HarvestAmountMultiplier", 0)).toBe("2");
  });
});
