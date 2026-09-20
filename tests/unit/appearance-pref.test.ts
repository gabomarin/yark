/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  APPEARANCE_SETTINGS_KEY,
  DEFAULT_APPEARANCE_SETTINGS,
  DEFAULT_LAYOUT_PROFILE_ID,
  DEFAULT_THEME_ID,
  LAYOUT_PROFILE_IDS,
  THEME_IDS,
  encodeAppearanceSettings,
  isLayoutProfileId,
  isThemeId,
  normalizeAppearanceSettings,
  parseAppearanceSettings,
  parseLayoutProfileId,
  parseThemeId,
} from "@shared/settings/appearance";
import { loadAppearancePref, writeAppearancePref } from "@features/settings/settingsModel";

describe("appearance shared helpers (#PUX-004 Track B)", () => {
  it("names the shipped theme and layout, and the SQLite key", () => {
    expect(THEME_IDS).toEqual(["dark"]);
    expect(LAYOUT_PROFILE_IDS).toEqual(["adaptive", "drawers"]);
    expect(DEFAULT_THEME_ID).toBe("dark");
    expect(DEFAULT_LAYOUT_PROFILE_ID).toBe("adaptive");
    expect(APPEARANCE_SETTINGS_KEY).toBe("appearance.v1");
    expect(DEFAULT_APPEARANCE_SETTINGS).toEqual({ theme: "dark", layout: "adaptive" });
  });

  it("accepts only registry ids", () => {
    expect(isThemeId("dark")).toBe(true);
    expect(isThemeId("light")).toBe(false);
    expect(isThemeId(undefined)).toBe(false);
    expect(isThemeId(7)).toBe(false);
    expect(parseThemeId("light")).toBe("dark");

    expect(isLayoutProfileId("adaptive")).toBe(true);
    expect(isLayoutProfileId("drawers")).toBe(true);
    expect(isLayoutProfileId("mosaic")).toBe(false);
    expect(parseLayoutProfileId("mosaic")).toBe("adaptive");
  });

  it("falls back per field for a missing, corrupt or partial row", () => {
    const defaults = { theme: "dark", layout: "adaptive" };
    expect(parseAppearanceSettings(null)).toEqual(defaults);
    expect(parseAppearanceSettings("")).toEqual(defaults);
    expect(parseAppearanceSettings("{not json")).toEqual(defaults);
    expect(parseAppearanceSettings(JSON.stringify({ theme: "vaporwave" }))).toEqual(defaults);
    expect(parseAppearanceSettings(JSON.stringify({}))).toEqual(defaults);
    // A row written before layout existed keeps its theme and gains the default profile.
    expect(parseAppearanceSettings(JSON.stringify({ theme: "dark" }))).toEqual(defaults);
    // Unknown values fall back per field, so one bad id does not reset the other.
    expect(parseAppearanceSettings(JSON.stringify({ theme: "dark", layout: "mosaic" }))).toEqual(defaults);
    expect(normalizeAppearanceSettings({ theme: "dark", layout: "drawers" })).toEqual({
      theme: "dark",
      layout: "drawers",
    });
  });

  it("round-trips the stored form", () => {
    const stored = { theme: "dark", layout: "drawers" } as const;
    expect(parseAppearanceSettings(encodeAppearanceSettings(stored))).toEqual(stored);
  });
});

describe("appearance preference (IPC)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads the stored theme and layout", async () => {
    vi.stubGlobal("api", {
      getAppearance: vi.fn().mockResolvedValue({ ok: true, data: { theme: "dark", layout: "drawers" } }),
      setAppearance: vi.fn(),
    });

    await expect(loadAppearancePref()).resolves.toEqual({ theme: "dark", layout: "drawers" });
    expect(window.api.getAppearance).toHaveBeenCalled();
  });

  it("applies the defaults when the row is unset, without writing them", async () => {
    const setAppearance = vi.fn();
    vi.stubGlobal("api", {
      getAppearance: vi.fn().mockResolvedValue({ ok: true, data: null }),
      setAppearance,
    });

    await expect(loadAppearancePref()).resolves.toEqual({ theme: "dark", layout: "adaptive" });
    expect(setAppearance).not.toHaveBeenCalled();
  });

  it("falls back when the read fails or throws", async () => {
    vi.stubGlobal("api", {
      getAppearance: vi.fn().mockResolvedValue({ ok: false, error: "db locked" }),
      setAppearance: vi.fn(),
    });
    await expect(loadAppearancePref()).resolves.toEqual({ theme: "dark", layout: "adaptive" });

    vi.stubGlobal("api", {
      getAppearance: vi.fn().mockRejectedValue(new Error("No handler")),
      setAppearance: vi.fn(),
    });
    await expect(loadAppearancePref()).resolves.toEqual({ theme: "dark", layout: "adaptive" });
  });

  it("persists through setAppearance and reports failure", async () => {
    const stored = { theme: "dark", layout: "drawers" } as const;
    const setAppearance = vi.fn().mockResolvedValue({ ok: true, data: stored });
    vi.stubGlobal("api", { getAppearance: vi.fn(), setAppearance });
    await expect(writeAppearancePref(stored)).resolves.toBe(true);
    expect(setAppearance).toHaveBeenCalledWith(stored);

    vi.stubGlobal("api", {
      getAppearance: vi.fn(),
      setAppearance: vi.fn().mockResolvedValue({ ok: false, error: "db locked" }),
    });
    await expect(writeAppearancePref(stored)).resolves.toBe(false);
  });
});
