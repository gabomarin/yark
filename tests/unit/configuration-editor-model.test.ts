import { describe, expect, it } from "vitest";
import {
  countUnsavedIniRowsForFile,
  iniPayloadsDirty,
  iniRowIdentity,
  isIniRowUnsaved,
  lookupBaselineIniValue,
} from "@features/server-workspace/components/ConfigurationEditor/configurationEditorModel";
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

  it("marks only the edited occurrence as unsaved", () => {
    const baseline = gus(`[ServerSettings]
ConfigOverrideItemMaxQuantity=A
ConfigOverrideItemMaxQuantity=B
`);
    expect(
      isIniRowUnsaved(
        {
          fileKey: "gameUserSettings",
          section: "ServerSettings",
          key: "ConfigOverrideItemMaxQuantity",
          value: "A",
          occurrence: 0,
        },
        baseline,
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
        baseline,
      ),
    ).toBe(true);
    expect(
      lookupBaselineIniValue(baseline, "gameUserSettings", "ServerSettings", "ConfigOverrideItemMaxQuantity", 1),
    ).toBe("B");
  });

  it("clears unsaved when the draft matches the saved value again", () => {
    const baseline = gus("[ServerSettings]\nDifficultyOffset=0.2\n");
    expect(
      isIniRowUnsaved(
        {
          fileKey: "gameUserSettings",
          section: "ServerSettings",
          key: "DifficultyOffset",
          value: "0.9",
          occurrence: 0,
        },
        baseline,
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
        baseline,
      ),
    ).toBe(false);
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
    // RCONPort is profile-owned / not visually editable — must not inflate counts.
    // XPMultiplier present only in draft counts as unsaved.
    const counts = countUnsavedIniRowsForFile(payload, baseline, "gameUserSettings");
    expect(counts.file).toBe(2);
    expect(lookupBaselineIniValue(baseline, "gameUserSettings", "ServerSettings", "XPMultiplier", 0)).toBeNull();
  });
});
