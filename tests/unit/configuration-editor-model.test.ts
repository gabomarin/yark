import { describe, expect, it } from "vitest";
import {
  alignIniDuplicateValues,
  applyIniRowRevertToPayload,
  buildIniRowMatchIndex,
  countUnsavedIniRowsForFile,
  iniPayloadsDirty,
  iniRowIdentity,
  isIniRowUnsaved,
  lookupMatchedBaselineValue,
} from "@features/server-workspace/components/ConfigurationEditor/configurationEditorModel";
import { textForFile } from "@features/server-workspace/iniModel";
import type { ServerIniPayload } from "@shared/types";

function gus(text: string): ServerIniPayload {
  return { gameUserSettings: text, game: "" };
}

describe("configurationEditorModel unsaved rows (PINI-001 / #661)", () => {
  it("compares payload dirty at full-file level", () => {
    const baseline = gus("[ServerSettings]\nDifficultyOffset=0.2\n");
    const same = gus("[ServerSettings]\nDifficultyOffset=0.2\n");
    const edited = gus("[ServerSettings]\nDifficultyOffset=0.5\n");
    expect(iniPayloadsDirty(same, baseline)).toBe(false);
    expect(iniPayloadsDirty(edited, baseline)).toBe(true);
  });

  it("identifies rows by file, section, key, and occurrence", () => {
    expect(iniRowIdentity("gameUserSettings", "ServerSettings", "XPMultiplier", 0)).toBe(
      iniRowIdentity("gameUserSettings", "serversettings", "xpmultiplier", 0),
    );
    expect(iniRowIdentity("gameUserSettings", "ServerSettings", "XPMultiplier", 0)).not.toBe(
      iniRowIdentity("gameUserSettings", "ServerSettings", "XPMultiplier", 1),
    );
  });

  it("aligns duplicate values so inserts do not steal the baseline occurrence", () => {
    expect(alignIniDuplicateValues(["new", "old"], ["old"])).toEqual([null, "old"]);
    expect(alignIniDuplicateValues(["B", "A"], ["A", "B"])).toEqual(["B", "A"]);
    expect(alignIniDuplicateValues(["changed"], ["old"])).toEqual(["old"]);
  });

  it("marks only the edited occurrence as unsaved via a shared match index", () => {
    const baseline = gus(`[ServerSettings]
ConfigOverrideItemMaxQuantity=A
ConfigOverrideItemMaxQuantity=B
`);
    const payload = gus(`[ServerSettings]
ConfigOverrideItemMaxQuantity=A
ConfigOverrideItemMaxQuantity=CHANGED
`);
    const index = buildIniRowMatchIndex(payload, baseline, "gameUserSettings");
    expect(index).not.toBeNull();
    expect(
      isIniRowUnsaved(
        {
          fileKey: "gameUserSettings",
          section: "ServerSettings",
          key: "ConfigOverrideItemMaxQuantity",
          value: "A",
          occurrence: 0,
        },
        index,
      ),
    ).toBe(false);
    expect(
      isIniRowUnsaved(
        {
          fileKey: "gameUserSettings",
          section: "ServerSettings",
          key: "ConfigOverrideItemMaxQuantity",
          value: "CHANGED",
          occurrence: 1,
        },
        index,
      ),
    ).toBe(true);
    expect(
      lookupMatchedBaselineValue(index!, "gameUserSettings", "ServerSettings", "ConfigOverrideItemMaxQuantity", 1),
    ).toBe("B");
  });

  it("matches baseline values after a raw-mode insert before a duplicate", () => {
    const baseline = gus("[ServerSettings]\nConfigOverrideItemMaxQuantity=old\n");
    const payload = gus(`[ServerSettings]
ConfigOverrideItemMaxQuantity=new
ConfigOverrideItemMaxQuantity=old
`);
    const index = buildIniRowMatchIndex(payload, baseline, "gameUserSettings");
    expect(
      isIniRowUnsaved(
        {
          fileKey: "gameUserSettings",
          section: "ServerSettings",
          key: "ConfigOverrideItemMaxQuantity",
          value: "new",
          occurrence: 0,
        },
        index,
      ),
    ).toBe(true);
    expect(
      lookupMatchedBaselineValue(index!, "gameUserSettings", "ServerSettings", "ConfigOverrideItemMaxQuantity", 0),
    ).toBeNull();
    expect(
      isIniRowUnsaved(
        {
          fileKey: "gameUserSettings",
          section: "ServerSettings",
          key: "ConfigOverrideItemMaxQuantity",
          value: "old",
          occurrence: 1,
        },
        index,
      ),
    ).toBe(false);

    const discarded = applyIniRowRevertToPayload(payload, index!, {
      fileKey: "gameUserSettings",
      section: "ServerSettings",
      key: "ConfigOverrideItemMaxQuantity",
      occurrence: 0,
    });
    expect(discarded.outcome).toBe("discarded");
    expect(textForFile(discarded.nextPayload, "gameUserSettings").trim()).toBe(
      "[ServerSettings]\nConfigOverrideItemMaxQuantity=old",
    );
  });

  it("clears unsaved when the draft matches the saved value again", () => {
    const baseline = gus("[ServerSettings]\nDifficultyOffset=0.2\n");
    const dirty = buildIniRowMatchIndex(gus("[ServerSettings]\nDifficultyOffset=0.9\n"), baseline, "gameUserSettings");
    const clean = buildIniRowMatchIndex(gus("[ServerSettings]\nDifficultyOffset=0.2\n"), baseline, "gameUserSettings");
    expect(
      isIniRowUnsaved(
        {
          fileKey: "gameUserSettings",
          section: "ServerSettings",
          key: "DifficultyOffset",
          value: "0.9",
          occurrence: 0,
        },
        dirty,
      ),
    ).toBe(true);
    expect(
      isIniRowUnsaved(
        {
          fileKey: "gameUserSettings",
          section: "ServerSettings",
          key: "DifficultyOffset",
          value: "0.2",
          occurrence: 0,
        },
        clean,
      ),
    ).toBe(false);
  });

  it("treats draft-only keys as unsaved with a null saved value", () => {
    const baseline = gus("[ServerSettings]\nDifficultyOffset=0.2\n");
    const payload = gus("[ServerSettings]\nDifficultyOffset=0.2\nXPMultiplier=2\n");
    const index = buildIniRowMatchIndex(payload, baseline, "gameUserSettings");
    expect(
      isIniRowUnsaved(
        {
          fileKey: "gameUserSettings",
          section: "ServerSettings",
          key: "XPMultiplier",
          value: "2",
          occurrence: 0,
        },
        index,
      ),
    ).toBe(true);
    expect(lookupMatchedBaselineValue(index!, "gameUserSettings", "ServerSettings", "XPMultiplier", 0)).toBeNull();
  });

  it("discards draft-only occurrences on revert", () => {
    const baseline = gus("[ServerSettings]\nDifficultyOffset=0.2\n");
    const payload = gus("[ServerSettings]\nDifficultyOffset=0.2\nXPMultiplier=2\n");
    const index = buildIniRowMatchIndex(payload, baseline, "gameUserSettings");
    const result = applyIniRowRevertToPayload(payload, index!, {
      fileKey: "gameUserSettings",
      section: "ServerSettings",
      key: "XPMultiplier",
      occurrence: 0,
    });
    expect(result.outcome).toBe("discarded");
    expect(textForFile(result.nextPayload, "gameUserSettings")).not.toContain("XPMultiplier");
  });

  it("counts unsaved visual rows per file without inventing defaults or owned keys", () => {
    const baseline = gus(`[ServerSettings]
DifficultyOffset=0.2
AdminLogging=False
RCONPort=27020
`);
    const payload = gus(`[ServerSettings]
DifficultyOffset=0.9
AdminLogging=False
RCONPort=27021
XPMultiplier=2
`);
    const index = buildIniRowMatchIndex(payload, baseline, "gameUserSettings");
    // RCONPort is profile-owned / not visually editable — must not inflate counts.
    // XPMultiplier present only in draft counts as unsaved.
    const counts = countUnsavedIniRowsForFile(payload, index, "gameUserSettings");
    expect(counts.file).toBe(2);
  });
});
