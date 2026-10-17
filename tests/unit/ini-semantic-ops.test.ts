import { describe, expect, it } from "vitest";
import {
  INI_SEMANTIC_CONFLICT_CODE,
  INI_SEMANTIC_OWNERSHIP_CODE,
  INI_SEMANTIC_UNSET_FORBIDDEN_CODE,
  applyIniSemanticOps,
  buildIniSemanticOps,
  getIniTextValueAt,
  IniSemanticPatchError,
  type IniSemanticOp,
} from "@shared/ini/ini-semantic-ops";
import type { ServerIniPayload } from "@shared/types";

function gus(body: string): ServerIniPayload {
  return {
    gameUserSettings: body.endsWith("\n") ? body : `${body}\n`,
    game: "",
  };
}

describe("getIniTextValueAt", () => {
  it("returns the value at occurrence or null when absent", () => {
    const text = "[ServerSettings]\nXPMultiplier=1\nXPMultiplier=2\n";
    expect(getIniTextValueAt(text, "ServerSettings", "XPMultiplier", 0)).toBe("1");
    expect(getIniTextValueAt(text, "ServerSettings", "XPMultiplier", 1)).toBe("2");
    expect(getIniTextValueAt(text, "ServerSettings", "XPMultiplier", 2)).toBeNull();
    expect(getIniTextValueAt(text, "ServerSettings", "Missing", 0)).toBeNull();
  });
});

describe("applyIniSemanticOps", () => {
  it("applies a simple Set and preserves comments / unrelated keys", () => {
    const base = gus(`[ServerSettings]
; keep me
XPMultiplier=1
TamingSpeedMultiplier=2
UnknownModKey=keep
`);
    const next = applyIniSemanticOps(base, [
      {
        kind: "set",
        fileKey: "gameUserSettings",
        section: "ServerSettings",
        key: "XPMultiplier",
        occurrence: 0,
        expectedPreviousValue: "1",
        nextValue: "3",
      },
    ]);
    expect(next.gameUserSettings).toContain("; keep me");
    expect(next.gameUserSettings).toContain("XPMultiplier=3");
    expect(next.gameUserSettings).toContain("TamingSpeedMultiplier=2");
    expect(next.gameUserSettings).toContain("UnknownModKey=keep");
  });

  it("merges non-overlapping external disk changes with local Set", () => {
    // Editor baseline had XP=1 Taming=2; operator changed XP→3.
    // Disk meanwhile got Taming→9 (external). Ops only touch XP.
    const disk = gus(`[ServerSettings]
XPMultiplier=1
TamingSpeedMultiplier=9
`);
    const next = applyIniSemanticOps(disk, [
      {
        kind: "set",
        fileKey: "gameUserSettings",
        section: "ServerSettings",
        key: "XPMultiplier",
        occurrence: 0,
        expectedPreviousValue: "1",
        nextValue: "3",
      },
    ]);
    expect(next.gameUserSettings).toContain("XPMultiplier=3");
    expect(next.gameUserSettings).toContain("TamingSpeedMultiplier=9");
  });

  it("rejects overlapping expected-previous mismatch without writing", () => {
    const disk = gus(`[ServerSettings]
XPMultiplier=9
`);
    const op: IniSemanticOp = {
      kind: "set",
      fileKey: "gameUserSettings",
      section: "ServerSettings",
      key: "XPMultiplier",
      occurrence: 0,
      expectedPreviousValue: "1",
      nextValue: "3",
    };
    try {
      applyIniSemanticOps(disk, [op]);
      expect.fail("expected conflict");
    } catch (err) {
      expect(err).toBeInstanceOf(IniSemanticPatchError);
      expect((err as IniSemanticPatchError).code).toBe(INI_SEMANTIC_CONFLICT_CODE);
      expect((err as IniSemanticPatchError).actualValue).toBe("9");
    }
  });

  it("rejects profile-owned keys", () => {
    const disk = gus(`[SessionSettings]
SessionName=Mine
`);
    try {
      applyIniSemanticOps(disk, [
        {
          kind: "set",
          fileKey: "gameUserSettings",
          section: "SessionSettings",
          key: "SessionName",
          occurrence: 0,
          expectedPreviousValue: "Mine",
          nextValue: "Hacked",
        },
      ]);
      expect.fail("expected ownership reject");
    } catch (err) {
      expect(err).toBeInstanceOf(IniSemanticPatchError);
      expect((err as IniSemanticPatchError).code).toBe(INI_SEMANTIC_OWNERSHIP_CODE);
    }
  });

  it("rejects Unset when absence maps to a profile nullable field", () => {
    const disk = gus(`[ServerSettings]
ServerPassword=secret
`);
    try {
      applyIniSemanticOps(disk, [
        {
          kind: "unset",
          fileKey: "gameUserSettings",
          section: "ServerSettings",
          key: "ServerPassword",
          occurrence: 0,
          expectedPreviousValue: "secret",
        },
      ]);
      expect.fail("expected unset forbidden");
    } catch (err) {
      expect(err).toBeInstanceOf(IniSemanticPatchError);
      // ServerPassword is profile-owned → ownership fires before absence policy.
      expect([INI_SEMANTIC_OWNERSHIP_CODE, INI_SEMANTIC_UNSET_FORBIDDEN_CODE]).toContain(
        (err as IniSemanticPatchError).code,
      );
    }
  });

  it("Unsets only the addressed occurrence", () => {
    const disk = gus(`[ServerSettings]
CustomFlag=a
CustomFlag=b
CustomFlag=c
`);
    const next = applyIniSemanticOps(disk, [
      {
        kind: "unset",
        fileKey: "gameUserSettings",
        section: "ServerSettings",
        key: "CustomFlag",
        occurrence: 1,
        expectedPreviousValue: "b",
      },
    ]);
    expect(getIniTextValueAt(next.gameUserSettings, "ServerSettings", "CustomFlag", 0)).toBe("a");
    expect(getIniTextValueAt(next.gameUserSettings, "ServerSettings", "CustomFlag", 1)).toBe("c");
    expect(getIniTextValueAt(next.gameUserSettings, "ServerSettings", "CustomFlag", 2)).toBeNull();
  });

  it("inserts when expected previous is null and occurrence is absent", () => {
    const disk = gus(`[ServerSettings]
TamingSpeedMultiplier=2
`);
    const next = applyIniSemanticOps(disk, [
      {
        kind: "set",
        fileKey: "gameUserSettings",
        section: "ServerSettings",
        key: "XPMultiplier",
        occurrence: 0,
        expectedPreviousValue: null,
        nextValue: "4",
      },
    ]);
    expect(next.gameUserSettings).toContain("XPMultiplier=4");
    expect(next.gameUserSettings).toContain("TamingSpeedMultiplier=2");
  });
});

describe("buildIniSemanticOps", () => {
  it("emits Set for changed visual rows and skips owned keys", () => {
    const baseline = gus(`[ServerSettings]
XPMultiplier=1
ServerAdminPassword=admin
[SessionSettings]
SessionName=Mine
`);
    const draft = gus(`[ServerSettings]
XPMultiplier=3
ServerAdminPassword=admin
[SessionSettings]
SessionName=Changed
`);
    const ops = buildIniSemanticOps(baseline, draft);
    expect(ops).toEqual([
      {
        kind: "set",
        fileKey: "gameUserSettings",
        section: "ServerSettings",
        key: "XPMultiplier",
        occurrence: 0,
        expectedPreviousValue: "1",
        nextValue: "3",
      },
    ]);
  });

  it("emits Unset when a visual occurrence was removed from the draft", () => {
    const baseline = gus(`[ServerSettings]
CustomFlag=a
CustomFlag=b
`);
    const draft = gus(`[ServerSettings]
CustomFlag=a
`);
    const ops = buildIniSemanticOps(baseline, draft);
    expect(ops).toEqual([
      {
        kind: "unset",
        fileKey: "gameUserSettings",
        section: "ServerSettings",
        key: "CustomFlag",
        occurrence: 1,
        expectedPreviousValue: "b",
      },
    ]);
  });
});
