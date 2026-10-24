import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyIniSemanticOps, buildIniSemanticOps } from "@shared/ini/ini-semantic-ops";
import type { IniFileFingerprints, ServerIniPayload } from "@shared/types";
import { configurationEditorSaveToastMessage, performConfigurationEditorSave } from "./configurationEditorSave";
import { iniSaveScope, iniSectionPending, iniViewDirty } from "./configurationEditorSaveScope";

function fingerprints(payload: ServerIniPayload): IniFileFingerprints {
  return {
    gameUserSettings: `gus:${payload.gameUserSettings.length}`.padEnd(24, "0").slice(0, 24),
    game: `game:${payload.game.length}`.padEnd(24, "0").slice(0, 24),
  };
}

describe("performConfigurationEditorSave", () => {
  beforeEach(() => {
    window.api = {
      ...window.api,
      saveServerIni: vi.fn(),
      saveServerIniSemantic: vi.fn(),
    } as typeof window.api;
  });

  it("visual mode sends semantic ops and adopts the merged payload", async () => {
    const baseline: ServerIniPayload = {
      gameUserSettings: "[ServerSettings]\nXPMultiplier=1\nTamingSpeedMultiplier=2\n",
      game: "",
    };
    const draft: ServerIniPayload = {
      gameUserSettings: "[ServerSettings]\nXPMultiplier=3\nTamingSpeedMultiplier=2\n",
      game: "",
    };
    // Disk gained a non-overlapping external edit; backend returns the merge.
    const merged = applyIniSemanticOps(
      {
        gameUserSettings: "[ServerSettings]\nXPMultiplier=1\nTamingSpeedMultiplier=9\n; external\n",
        game: "",
      },
      buildIniSemanticOps(baseline, draft),
    );
    vi.mocked(window.api.saveServerIniSemantic).mockResolvedValue({
      ok: true,
      data: {
        valid: true,
        issues: [],
        diff: [],
        changedCount: 1,
        pending: false,
        fingerprints: fingerprints(merged),
        payload: merged,
      },
    });

    const outcome = await performConfigurationEditorSave({
      serverId: "srv-1",
      mode: "visual",
      draft,
      baseline,
      expectedFingerprints: fingerprints(baseline),
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(window.api.saveServerIniSemantic).toHaveBeenCalledWith(
      "srv-1",
      expect.arrayContaining([
        expect.objectContaining({
          kind: "set",
          key: "XPMultiplier",
          expectedPreviousValue: "1",
          nextValue: "3",
        }),
      ]),
    );
    expect(window.api.saveServerIni).not.toHaveBeenCalled();
    expect(outcome.savedPayload.gameUserSettings).toContain("XPMultiplier=3");
    expect(outcome.savedPayload.gameUserSettings).toContain("TamingSpeedMultiplier=9");
  });

  it("visual mode surfaces expected-value conflicts", async () => {
    vi.mocked(window.api.saveServerIniSemantic).mockResolvedValue({
      ok: false,
      error: "XPMultiplier changed outside YARK",
      code: "INI_SEMANTIC_CONFLICT",
    });

    const outcome = await performConfigurationEditorSave({
      serverId: "srv-1",
      mode: "visual",
      draft: { gameUserSettings: "[ServerSettings]\nXPMultiplier=3\n", game: "" },
      baseline: { gameUserSettings: "[ServerSettings]\nXPMultiplier=1\n", game: "" },
      expectedFingerprints: { gameUserSettings: "a", game: "b" },
    });

    expect(outcome).toEqual({
      ok: false,
      error: "XPMultiplier changed outside YARK",
      conflict: true,
    });
  });

  it("text mode forwards fingerprints on full-buffer save", async () => {
    const draft: ServerIniPayload = {
      gameUserSettings: "[ServerSettings]\nXPMultiplier=3\n",
      game: "",
    };
    const fps = fingerprints(draft);
    vi.mocked(window.api.saveServerIni).mockResolvedValue({
      ok: true,
      data: {
        valid: true,
        issues: [],
        diff: [],
        changedCount: 1,
        pending: false,
        fingerprints: fps,
      },
    });

    const outcome = await performConfigurationEditorSave({
      serverId: "srv-1",
      mode: "text",
      draft,
      baseline: { gameUserSettings: "[ServerSettings]\nXPMultiplier=1\n", game: "" },
      expectedFingerprints: fps,
    });

    expect(window.api.saveServerIni).toHaveBeenCalledWith("srv-1", draft, fps);
    expect(window.api.saveServerIniSemantic).not.toHaveBeenCalled();
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.savedPayload).toEqual(draft);
  });

  it("sanitizes draft/baseline before building ops", async () => {
    vi.mocked(window.api.saveServerIniSemantic).mockResolvedValue({
      ok: true,
      data: {
        valid: true,
        issues: [],
        diff: [],
        changedCount: 0,
        pending: false,
        fingerprints: { gameUserSettings: "x", game: "y" },
        payload: { gameUserSettings: "[ServerSettings]\n", game: "" },
      },
    });

    await performConfigurationEditorSave({
      serverId: "srv-1",
      mode: "visual",
      draft: {
        gameUserSettings: "[ShooterGameUserSettings]\nResolutionSizeX=1920\n[ServerSettings]\nXPMultiplier=1\n",
        game: "",
      },
      baseline: {
        gameUserSettings: "[ShooterGameUserSettings]\nResolutionSizeX=1920\n[ServerSettings]\nXPMultiplier=1\n",
        game: "",
      },
      expectedFingerprints: { gameUserSettings: "a", game: "b" },
    });

    const ops = vi.mocked(window.api.saveServerIniSemantic).mock.calls[0]?.[1] ?? [];
    expect(ops).toEqual([]);
  });

  it("saves GameUserSettings.ini without the Game.ini edits or a blocked engram", async () => {
    const baseline: ServerIniPayload = {
      gameUserSettings: "[ServerSettings]\nXPMultiplier=1\n",
      game: "[/Script/ShooterGame.ShooterGameMode]\nDifficultyOffset=1\nOverridePlayerLevelEngramPoints=8\n",
    };
    const draft: ServerIniPayload = {
      gameUserSettings: "[ServerSettings]\nXPMultiplier=3\n",
      game: "[/Script/ShooterGame.ShooterGameMode]\nDifficultyOffset=2\nOverridePlayerLevelEngramPoints=10\n",
    };
    const saved: ServerIniPayload = {
      gameUserSettings: "[ServerSettings]\nXPMultiplier=3\n",
      game: baseline.game,
    };
    vi.mocked(window.api.saveServerIniSemantic).mockResolvedValue({
      ok: true,
      data: {
        valid: true,
        issues: [],
        diff: [],
        changedCount: 1,
        pending: false,
        fingerprints: fingerprints(saved),
        payload: saved,
      },
    });

    const outcome = await performConfigurationEditorSave({
      serverId: "srv-1",
      mode: "visual",
      draft,
      baseline,
      expectedFingerprints: fingerprints(baseline),
      scope: "gameUserSettings",
      engramEdits: [
        {
          kind: "delete",
          section: "ShooterGameMode",
          occurrence: 0,
          expectedRaw: "x",
          className: "EngramEntry_Campfire_C",
        },
      ],
      engramBlocked: true,
    });

    const ops = vi.mocked(window.api.saveServerIniSemantic).mock.calls[0]?.[1] ?? [];
    expect(ops.map((op) => op.key)).toEqual(["XPMultiplier"]);
    expect(window.api.saveServerIniSemantic).toHaveBeenCalledWith("srv-1", ops);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.resetEngrams).toBe(false);
    expect(outcome.draftPayload.game).toContain("DifficultyOffset=2");
    expect(outcome.draftPayload.game).toContain("OverridePlayerLevelEngramPoints=10");
    expect(outcome.savedPayload.gameUserSettings).toContain("XPMultiplier=3");
  });

  it("saves points per level without the other Game.ini keys", async () => {
    const baseline: ServerIniPayload = {
      gameUserSettings: "",
      game: "[/Script/ShooterGame.ShooterGameMode]\nDifficultyOffset=1\nOverridePlayerLevelEngramPoints=8\n",
    };
    const draft: ServerIniPayload = {
      gameUserSettings: "",
      game: "[/Script/ShooterGame.ShooterGameMode]\nDifficultyOffset=2\nOverridePlayerLevelEngramPoints=10\n",
    };
    vi.mocked(window.api.saveServerIniSemantic).mockResolvedValue({
      ok: true,
      data: {
        valid: true,
        issues: [],
        diff: [],
        changedCount: 1,
        pending: false,
        fingerprints: fingerprints(draft),
        payload: {
          gameUserSettings: "",
          game: "[/Script/ShooterGame.ShooterGameMode]\nDifficultyOffset=1\nOverridePlayerLevelEngramPoints=10\n",
        },
      },
    });

    const outcome = await performConfigurationEditorSave({
      serverId: "srv-1",
      mode: "visual",
      draft,
      baseline,
      expectedFingerprints: fingerprints(baseline),
      scope: "engramPoints",
      engramBlocked: true,
    });

    const ops = vi.mocked(window.api.saveServerIniSemantic).mock.calls[0]?.[1] ?? [];
    expect(ops.map((op) => op.key)).toEqual(["OverridePlayerLevelEngramPoints"]);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.draftPayload.game).toContain("DifficultyOffset=2");
    expect(outcome.draftPayload.game).toContain("OverridePlayerLevelEngramPoints=10");
  });

  it("refuses Overrides Save while an engram line has no effect", async () => {
    const outcome = await performConfigurationEditorSave({
      serverId: "srv-1",
      mode: "visual",
      draft: { gameUserSettings: "", game: "" },
      baseline: { gameUserSettings: "", game: "" },
      expectedFingerprints: { gameUserSettings: "a", game: "b" },
      scope: "engramOverrides",
      engramBlocked: true,
    });

    expect(outcome).toEqual({
      ok: false,
      error: "Fix the engram line before saving.",
      conflict: false,
    });
    expect(window.api.saveServerIniSemantic).not.toHaveBeenCalled();
  });
});

describe("iniSaveScope", () => {
  it("maps each open view to its file or section", () => {
    expect(iniSaveScope("gameUserSettings", "visual", "settings", "overrides")).toBe("gameUserSettings");
    expect(iniSaveScope("game", "visual", "settings", "overrides")).toBe("gameSettings");
    expect(iniSaveScope("game", "visual", "engrams", "points")).toBe("engramPoints");
    expect(iniSaveScope("game", "visual", "engrams", "overrides")).toBe("engramOverrides");
    expect(iniSaveScope("game", "text", "engrams", "overrides")).toBe("gameText");
  });

  it("treats only the open view as dirty", () => {
    const baseline = {
      gameUserSettings: "[ServerSettings]\nXPMultiplier=1\n",
      game: "[/Script/ShooterGame.ShooterGameMode]\nOverridePlayerLevelEngramPoints=8\n",
    };
    const draft = {
      gameUserSettings: "[ServerSettings]\nXPMultiplier=1\n",
      game: "[/Script/ShooterGame.ShooterGameMode]\nOverridePlayerLevelEngramPoints=10\n",
    };
    expect(iniViewDirty("engramPoints", baseline, draft, 0)).toBe(true);
    expect(iniViewDirty("gameSettings", baseline, draft, 0)).toBe(false);
    expect(iniViewDirty("gameUserSettings", baseline, draft, 0)).toBe(false);
    expect(iniViewDirty("engramOverrides", baseline, draft, 0)).toBe(false);
  });

  it("marks points per level without marking Settings", () => {
    const baseline = {
      gameUserSettings: "[ServerSettings]\nXPMultiplier=1\n",
      game: "[/Script/ShooterGame.ShooterGameMode]\nDifficultyOffset=1\nOverridePlayerLevelEngramPoints=8\n",
    };
    const draft = {
      gameUserSettings: "[ServerSettings]\nXPMultiplier=1\n",
      game: "[/Script/ShooterGame.ShooterGameMode]\nDifficultyOffset=1\nOverridePlayerLevelEngramPoints=10\n",
    };
    expect(iniSectionPending(baseline, draft)).toEqual({
      gameUserSettings: false,
      gameSettings: false,
      engramPoints: true,
    });
  });
});

describe("configurationEditorSaveToastMessage", () => {
  it("formats pending and zero-change toasts", () => {
    expect(configurationEditorSaveToastMessage(true, 0)).toEqual({
      title: "INI queued",
      message: "Queued with no changes — applies when the server stops.",
    });
    expect(configurationEditorSaveToastMessage(true, 1).message).toContain("Queued 1 change");
    expect(configurationEditorSaveToastMessage(false, 0)).toEqual({
      title: "INI saved",
      message: "Saved with no changes.",
    });
    expect(configurationEditorSaveToastMessage(false, 2).message).toContain("Saved 2 changes");
  });
});
