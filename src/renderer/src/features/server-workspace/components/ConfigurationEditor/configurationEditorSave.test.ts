import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyIniSemanticOps, buildIniSemanticOps } from "@shared/ini/ini-semantic-ops";
import type { IniFileFingerprints, ServerIniPayload } from "@shared/types";
import { configurationEditorSaveToastMessage, performConfigurationEditorSave } from "./configurationEditorSave";

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
