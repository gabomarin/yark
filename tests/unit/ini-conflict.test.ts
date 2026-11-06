import { describe, expect, it } from "vitest";
import { getIniTextValueAt } from "@shared/ini/ini-semantic-ops";
import {
  canKeepConflictSide,
  parseIniConflictOccurrence,
  payloadWithKeptChoices,
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
    expect(semanticOpForKeptSide(conflict, "file")).toMatchObject({
      kind: "check",
      expectedPreviousValue: "9",
    });
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

  it("removes earlier copies after later ones so indexes do not shift", () => {
    const payload = gus("[ServerSettings]\nCustomFlag=a\nCustomFlag=b\nCustomFlag=c\n");
    const row = (occurrence: number, disk: string): IniConflictOccurrence => ({
      ...conflict,
      key: "CustomFlag",
      occurrence,
      loaded: null,
      local: null,
      disk,
      removes: true,
    });
    const next = payloadWithKeptChoices(payload, [
      { conflict: row(0, "a"), side: "saved" },
      { conflict: row(1, "b"), side: "saved" },
    ]);
    expect(getIniTextValueAt(next.gameUserSettings, "ServerSettings", "CustomFlag", 0)).toBe("c");
    expect(getIniTextValueAt(next.gameUserSettings, "ServerSettings", "CustomFlag", 1)).toBeNull();
  });
});

describe("parseIniConflictOccurrence", () => {
  it("keeps a secret value that would be redacted in a diagnostic message", () => {
    expect(
      parseIniConflictOccurrence({
        ...conflict,
        local: "hunter2-secret",
        keyValues: ["hunter2-secret"],
      }),
    ).toMatchObject({ local: "hunter2-secret", keyValues: ["hunter2-secret"] });
  });

  it("drops a fractional or negative occurrence", () => {
    expect(parseIniConflictOccurrence({ ...conflict, occurrence: 1.5 })).toBeNull();
    expect(parseIniConflictOccurrence({ ...conflict, occurrence: -1 })).toBeNull();
  });
});
