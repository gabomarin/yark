/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_UI_DENSITY,
  UI_DENSITY_LEGACY_LOCAL_STORAGE_KEY,
  UI_DENSITY_SETTING_KEY,
  isUiDensity,
  parseUiDensity,
} from "@shared/ui-density";
import {
  loadUiDensityPref,
  writeUiDensityPref,
} from "@features/settings/settingsModel";

describe("ui density shared helpers", () => {
  it("parses valid values and falls back to compact", () => {
    expect(isUiDensity("compact")).toBe(true);
    expect(isUiDensity("comfortable")).toBe(true);
    expect(isUiDensity("huge")).toBe(false);
    expect(parseUiDensity(null)).toBe(DEFAULT_UI_DENSITY);
    expect(parseUiDensity("comfortable")).toBe("comfortable");
  });

  it("uses the SQLite app_settings key uiDensity", () => {
    expect(UI_DENSITY_SETTING_KEY).toBe("uiDensity");
  });
});

describe("ui density preference (IPC + legacy migration)", () => {
  afterEach(() => {
    window.localStorage.removeItem(UI_DENSITY_LEGACY_LOCAL_STORAGE_KEY);
    vi.unstubAllGlobals();
  });

  it("loads from app_settings when present", async () => {
    vi.stubGlobal("api", {
      getUiDensity: vi.fn().mockResolvedValue({ ok: true, data: "comfortable" }),
      setUiDensity: vi.fn(),
    });

    await expect(loadUiDensityPref()).resolves.toBe("comfortable");
    expect(window.api.getUiDensity).toHaveBeenCalled();
  });

  it("defaults to compact when unset and no legacy value", async () => {
    vi.stubGlobal("api", {
      getUiDensity: vi.fn().mockResolvedValue({ ok: true, data: null }),
      setUiDensity: vi.fn(),
    });

    await expect(loadUiDensityPref()).resolves.toBe("compact");
    expect(window.api.setUiDensity).not.toHaveBeenCalled();
  });

  it("migrates legacy localStorage into app_settings once", async () => {
    window.localStorage.setItem(UI_DENSITY_LEGACY_LOCAL_STORAGE_KEY, "comfortable");
    const setUiDensity = vi.fn().mockResolvedValue({ ok: true, data: "comfortable" });
    vi.stubGlobal("api", {
      getUiDensity: vi.fn().mockResolvedValue({ ok: true, data: null }),
      setUiDensity,
    });

    await expect(loadUiDensityPref()).resolves.toBe("comfortable");
    expect(setUiDensity).toHaveBeenCalledWith("comfortable");
    expect(window.localStorage.getItem(UI_DENSITY_LEGACY_LOCAL_STORAGE_KEY)).toBeNull();
  });

  it("keeps legacy localStorage when migration write fails", async () => {
    window.localStorage.setItem(UI_DENSITY_LEGACY_LOCAL_STORAGE_KEY, "comfortable");
    const setUiDensity = vi.fn().mockResolvedValue({ ok: false, error: "db locked" });
    vi.stubGlobal("api", {
      getUiDensity: vi.fn().mockResolvedValue({ ok: true, data: null }),
      setUiDensity,
    });

    await expect(loadUiDensityPref()).resolves.toBe("comfortable");
    expect(window.localStorage.getItem(UI_DENSITY_LEGACY_LOCAL_STORAGE_KEY)).toBe(
      "comfortable",
    );
  });

  it("falls back when getUiDensity returns ok:false", async () => {
    vi.stubGlobal("api", {
      getUiDensity: vi.fn().mockResolvedValue({ ok: false, error: "db locked" }),
      setUiDensity: vi.fn(),
    });

    await expect(loadUiDensityPref()).resolves.toBe("compact");
    expect(window.api.setUiDensity).not.toHaveBeenCalled();
  });

  it("falls back when getUiDensity IPC throws", async () => {
    window.localStorage.setItem(UI_DENSITY_LEGACY_LOCAL_STORAGE_KEY, "comfortable");
    vi.stubGlobal("api", {
      getUiDensity: vi.fn().mockRejectedValue(new Error("No handler")),
      setUiDensity: vi.fn(),
    });

    await expect(loadUiDensityPref()).resolves.toBe("comfortable");
  });

  it("persists changes through setUiDensity IPC", async () => {
    const setUiDensity = vi.fn().mockResolvedValue({ ok: true, data: "comfortable" });
    vi.stubGlobal("api", {
      getUiDensity: vi.fn(),
      setUiDensity,
    });

    await expect(writeUiDensityPref("comfortable")).resolves.toBe(true);
    expect(setUiDensity).toHaveBeenCalledWith("comfortable");
  });

  it("returns false when setUiDensity fails", async () => {
    vi.stubGlobal("api", {
      getUiDensity: vi.fn(),
      setUiDensity: vi.fn().mockResolvedValue({ ok: false, error: "db locked" }),
    });

    await expect(writeUiDensityPref("comfortable")).resolves.toBe(false);
  });

  it("returns false when setUiDensity throws", async () => {
    vi.stubGlobal("api", {
      getUiDensity: vi.fn(),
      setUiDensity: vi.fn().mockRejectedValue(new Error("No handler")),
    });

    await expect(writeUiDensityPref("comfortable")).resolves.toBe(false);
  });
});
