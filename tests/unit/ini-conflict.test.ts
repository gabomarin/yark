import { describe, expect, it } from "vitest";
import { getIniTextValueAt } from "@shared/ini/ini-semantic-ops";
import {
  canKeepConflictSide,
  payloadWithKeptValue,
  semanticOpForKeptSide,
  type IniConflictOccurrence,
} from "@shared/ini/ini-conflict";
import type { ServerIniPayload } from "@shared/types";

const conflict: IniConflictOccurrence = {
  kind: "scalar",
  fileKey: "gameUserSettings",
  section: "ServerSettings",
  key: "XPMultiplier",
  occurrence: 0,
  loaded: "3",
  local: "6",
  disk: "9",
};

function gus(body: string): ServerIniPayload {
  return { gameUserSettings: body.endsWith("\n") ? body : `${body}\n`, game: "" };
}

describe("semanticOpForKeptSide", () => {
  it("writes the last save or the YARK value onto the file value just shown", () => {
    expect(semanticOpForKeptSide(conflict, "saved")).toMatchObject({
      kind: "set",
      nextValue: "3",
      expectedPreviousValue: "9",
    });
    expect(semanticOpForKeptSide(conflict, "yark")).toMatchObject({
      kind: "set",
      nextValue: "6",
      expectedPreviousValue: "9",
    });
    expect(semanticOpForKeptSide(conflict, "file")).toBeNull();
  });

  it("unsets when the kept value is absent and the file still has the key", () => {
    const absent = { ...conflict, loaded: null, local: "6", disk: "9" };
    expect(semanticOpForKeptSide(absent, "saved")).toMatchObject({ kind: "unset", expectedPreviousValue: "9" });
  });

  it("refuses a null YARK value that is not a delete", () => {
    const failed = { ...conflict, local: null };
    expect(canKeepConflictSide(failed, "yark")).toBe(false);
    expect(semanticOpForKeptSide(failed, "yark")).toBeNull();
    expect(canKeepConflictSide(failed, "file")).toBe(true);
  });
});

describe("payloadWithKeptValue", () => {
  it("adopts the file value into the draft and leaves other keys", () => {
    const payload = gus("[ServerSettings]\nXPMultiplier=6\nDifficultyOffset=1\n");
    const next = payloadWithKeptValue(payload, conflict, "file");
    expect(getIniTextValueAt(next.gameUserSettings, "ServerSettings", "XPMultiplier", 0)).toBe("9");
    expect(getIniTextValueAt(next.gameUserSettings, "ServerSettings", "DifficultyOffset", 0)).toBe("1");
  });
});
