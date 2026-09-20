/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  APPEARANCE_SETTINGS_KEY,
  DEFAULT_APPEARANCE_SETTINGS,
  DEFAULT_THEME_ID,
  THEME_IDS,
  encodeAppearanceSettings,
  isThemeId,
  normalizeAppearanceSettings,
  parseAppearanceSettings,
  parseThemeId,
} from "@shared/settings/appearance";
import { loadAppearancePref, writeAppearancePref } from "@features/settings/settingsModel";

describe("appearance shared helpers (#PUX-004 Track B)", () => {
  it("names the shipped theme and the SQLite key", () => {
    expect(THEME_IDS).toEqual(["dark"]);
    expect(DEFAULT_THEME_ID).toBe("dark");
    expect(APPEARANCE_SETTINGS_KEY).toBe("appearance.v1");
    expect(DEFAULT_APPEARANCE_SETTINGS).toEqual({ theme: "dark" });
  });

  it("accepts only registry ids", () => {
    expect(isThemeId("dark")).toBe(true);
    expect(isThemeId("light")).toBe(false);
    expect(isThemeId(undefined)).toBe(false);
    expect(isThemeId(7)).toBe(false);
    expect(parseThemeId("light")).toBe("dark");
  });

  it("falls back to the default theme for a missing, corrupt or partial row", () => {
    expect(parseAppearanceSettings(null)).toEqual({ theme: "dark" });
    expect(parseAppearanceSettings("")).toEqual({ theme: "dark" });
    expect(parseAppearanceSettings("{not json")).toEqual({ theme: "dark" });
    expect(parseAppearanceSettings(JSON.stringify({ theme: "vaporwave" }))).toEqual({ theme: "dark" });
    expect(parseAppearanceSettings(JSON.stringify({}))).toEqual({ theme: "dark" });
    expect(normalizeAppearanceSettings({ theme: "dark" })).toEqual({ theme: "dark" });
  });

  it("round-trips the stored form", () => {
    expect(parseAppearanceSettings(encodeAppearanceSettings({ theme: "dark" }))).toEqual({ theme: "dark" });
  });
});

describe("appearance preference (IPC)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads the stored theme", async () => {
    vi.stubGlobal("api", {
      getAppearance: vi.fn().mockResolvedValue({ ok: true, data: { theme: "dark" } }),
      setAppearance: vi.fn(),
    });

    await expect(loadAppearancePref()).resolves.toEqual({ theme: "dark" });
    expect(window.api.getAppearance).toHaveBeenCalled();
  });

  it("applies the default when the row is unset, without writing it", async () => {
    const setAppearance = vi.fn();
    vi.stubGlobal("api", {
      getAppearance: vi.fn().mockResolvedValue({ ok: true, data: null }),
      setAppearance,
    });

    await expect(loadAppearancePref()).resolves.toEqual({ theme: "dark" });
    expect(setAppearance).not.toHaveBeenCalled();
  });

  it("falls back when the read fails or throws", async () => {
    vi.stubGlobal("api", {
      getAppearance: vi.fn().mockResolvedValue({ ok: false, error: "db locked" }),
      setAppearance: vi.fn(),
    });
    await expect(loadAppearancePref()).resolves.toEqual({ theme: "dark" });

    vi.stubGlobal("api", {
      getAppearance: vi.fn().mockRejectedValue(new Error("No handler")),
      setAppearance: vi.fn(),
    });
    await expect(loadAppearancePref()).resolves.toEqual({ theme: "dark" });
  });

  it("persists through setAppearance and reports failure", async () => {
    const setAppearance = vi.fn().mockResolvedValue({ ok: true, data: { theme: "dark" } });
    vi.stubGlobal("api", { getAppearance: vi.fn(), setAppearance });
    await expect(writeAppearancePref({ theme: "dark" })).resolves.toBe(true);
    expect(setAppearance).toHaveBeenCalledWith({ theme: "dark" });

    vi.stubGlobal("api", {
      getAppearance: vi.fn(),
      setAppearance: vi.fn().mockResolvedValue({ ok: false, error: "db locked" }),
    });
    await expect(writeAppearancePref({ theme: "dark" })).resolves.toBe(false);
  });
});
