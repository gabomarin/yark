import { describe, expect, it, vi } from "vitest";
import {
  collectClusterIniTemplateSeedPayloads,
  defaultClusterWideValues,
  isSparseClusterIniGameUserSettings,
  readTributeValues,
  seedClusterIniTemplateBase,
  summarizeClusterWideValues,
  validateClusterWideValues,
} from "./tributeModel";

describe("cluster tribute settings model", () => {
  it("treats empty or tribute-only GameUserSettings as a sparse cluster template", () => {
    expect(isSparseClusterIniGameUserSettings("")).toBe(true);
    expect(isSparseClusterIniGameUserSettings("[ServerSettings]\n")).toBe(true);
    expect(
      isSparseClusterIniGameUserSettings("[ServerSettings]\nTributeItemExpirationSeconds=86400\nMaxTributeItems=50\n"),
    ).toBe(true);
    expect(
      isSparseClusterIniGameUserSettings(
        "[ServerSettings]\nTributeItemExpirationSeconds=86400\nPreventUploadItems=False\n",
      ),
    ).toBe(false);
    expect(isSparseClusterIniGameUserSettings("[SessionSettings]\nMaxTributeItems=50\n")).toBe(false);
    expect(
      isSparseClusterIniGameUserSettings(
        "[ServerSettings]\nMaxTributeItems=50\n[SessionSettings]\nSessionName=TheIsland\n",
      ),
    ).toBe(false);
  });

  it("skips member INI reads when the existing cluster template is not sparse", async () => {
    const readMemberIni = vi.fn(async () => ({
      gameUserSettings: "[ServerSettings]\nUnrelatedSetting=keep-me\n",
      game: "",
    }));
    await expect(
      collectClusterIniTemplateSeedPayloads(
        { gameUserSettings: "[ServerSettings]\nSessionName=KeepTemplate\n", game: "" },
        [{ id: "srv-a" }, { id: "srv-b" }],
        readMemberIni,
      ),
    ).resolves.toEqual([]);
    expect(readMemberIni).not.toHaveBeenCalled();
  });

  it("re-reads every member when seeding a sparse template instead of trusting Transfer snapshots", async () => {
    const stale = {
      gameUserSettings: "[ServerSettings]\nUnrelatedSetting=stale\n",
      game: "",
    };
    const fresh = {
      gameUserSettings: "[ServerSettings]\nUnrelatedSetting=fresh-after-overlay-edit\n",
      game: "",
    };
    const readMemberIni = vi.fn(async (serverId: string) => {
      if (serverId === "srv-a") return fresh;
      return {
        gameUserSettings: "[ServerSettings]\nMaxTributeItems=50\n",
        game: "",
      };
    });
    // Stale Transfer-panel snapshots must not be preferred over a fresh read —
    // the server workspace overlay can edit INI without remounting Clusters.
    await expect(
      collectClusterIniTemplateSeedPayloads({ gameUserSettings: "", game: "" }, [{ id: "srv-a" }, { id: "srv-b" }], readMemberIni),
    ).resolves.toEqual([
      fresh,
      { gameUserSettings: "[ServerSettings]\nMaxTributeItems=50\n", game: "" },
    ]);
    expect(readMemberIni).toHaveBeenCalledTimes(2);
    expect(readMemberIni).toHaveBeenCalledWith("srv-a");
    expect(readMemberIni).toHaveBeenCalledWith("srv-b");
    expect(stale.gameUserSettings).not.toContain("fresh-after-overlay-edit");
  });

  it("starts member seed reads together instead of waiting sequentially", async () => {
    let started = 0;
    const blockers: Array<() => void> = [];
    const readMemberIni = vi.fn(async (serverId: string) => {
      started += 1;
      await new Promise<void>((resolve) => {
        blockers.push(resolve);
      });
      return {
        gameUserSettings: `[ServerSettings]\nUnrelatedSetting=${serverId}\n`,
        game: "",
      };
    });
    const pending = collectClusterIniTemplateSeedPayloads(null, [{ id: "srv-a" }, { id: "srv-b" }], readMemberIni);
    await vi.waitFor(() => expect(started).toBe(2));
    for (const release of blockers) release();
    await pending;
    expect(readMemberIni).toHaveBeenCalledTimes(2);
  });

  it("drops failed member reads and keeps successful ones when seeding", async () => {
    const member = {
      gameUserSettings: "[ServerSettings]\nUnrelatedSetting=keep-me\n",
      game: "",
    };
    const readMemberIni = vi.fn(async (serverId: string) => (serverId === "srv-b" ? member : null));
    await expect(
      collectClusterIniTemplateSeedPayloads({ gameUserSettings: "", game: "" }, [{ id: "srv-a" }, { id: "srv-b" }], readMemberIni),
    ).resolves.toEqual([member]);
    expect(readMemberIni).toHaveBeenCalledTimes(2);
  });

  it("seeds a sparse cluster template from a member before Transfer Save", () => {
    const member = {
      gameUserSettings:
        "[ServerSettings]\nPreventUploadItems=False\nUnrelatedSetting=keep-me\nTributeItemExpirationSeconds=1\n",
      game: "[/script/shootergame.shootergamemode]\nHarvestAmountMultiplier=2\n",
    };
    expect(seedClusterIniTemplateBase({ gameUserSettings: "", game: "" }, [member]).gameUserSettings).toContain(
      "UnrelatedSetting=keep-me",
    );
    expect(
      seedClusterIniTemplateBase(
        {
          gameUserSettings: "[ServerSettings]\nTributeItemExpirationSeconds=86400\nMaxTributeItems=50\n",
          game: "[Existing]\nKeepGame=True\n",
        },
        [member],
      ),
    ).toEqual({
      gameUserSettings: member.gameUserSettings,
      game: "[Existing]\nKeepGame=True\n",
    });
    expect(() => seedClusterIniTemplateBase(null, [])).toThrow(/empty cluster INI template/i);
  });

  it("uses catalog defaults only to seed the editable form when a key is missing", () => {
    expect(defaultClusterWideValues()).toEqual({
      TributeItemExpirationSeconds: 86400,
      TributeDinoExpirationSeconds: 86400,
      TributeCharacterExpirationSeconds: 0,
      MaxTributeItems: 50,
      MaxTributeDinos: 20,
      MaxTributeCharacters: 10,
    });
    expect(readTributeValues("[ServerSettings]\nMaxTributeItems=64\n").MaxTributeItems).toBe("64");
    expect(readTributeValues("").MaxTributeItems).toBeNull();
  });

  it("reports missing and different settings without folding per-map keys into drift", () => {
    expect(
      summarizeClusterWideValues([
        { TributeItemExpirationSeconds: "86400", MaxTributeItems: "50" },
        { TributeItemExpirationSeconds: "172800", MaxTributeItems: "50" },
      ]),
    ).toMatchObject({
      TributeItemExpirationSeconds: "different",
      TributeDinoExpirationSeconds: "missing",
      MaxTributeItems: "matching",
    });
  });

  it("rejects invalid durations and slot values below the catalog defaults", () => {
    const defaults = defaultClusterWideValues();
    expect(validateClusterWideValues({ ...defaults, TributeItemExpirationSeconds: 31_536_001 })).toMatch(/one year/i);
    expect(validateClusterWideValues({ ...defaults, TributeItemExpirationSeconds: 31_536_000 })).toBeNull();
    expect(validateClusterWideValues({ ...defaults, MaxTributeDinos: 19 })).toMatch(/default of 20/i);
    expect(validateClusterWideValues({ ...defaults, MaxTributeItems: 1.5 })).toMatch(/whole number/i);
    expect(validateClusterWideValues(defaults)).toBeNull();
  });
});
