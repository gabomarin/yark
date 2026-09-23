/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  APPEARANCE_SETTINGS_KEY,
  DEFAULT_APPEARANCE_SETTINGS,
  DEFAULT_THEME_ID,
  DEFAULT_WORKSPACE_PANELS_ID,
  THEME_IDS,
  WORKSPACE_PANELS_IDS,
  encodeAppearanceSettings,
  isThemeId,
  isWorkspacePanelsId,
  normalizeAppearanceSettings,
  parseAppearanceSettings,
  parseThemeId,
  parseWorkspacePanelsId,
} from "@shared/settings/appearance";
import { loadAppearancePref, writeAppearancePref } from "@features/settings/settingsModel";

describe("appearance shared helpers (#PUX-004 Track B)", () => {
  it("names the shipped themes and panels option, and the SQLite key", () => {
    expect(THEME_IDS).toEqual(["dark", "light"]);
    expect(WORKSPACE_PANELS_IDS).toEqual(["auto", "drawers"]);
    expect(DEFAULT_THEME_ID).toBe("dark");
    expect(DEFAULT_WORKSPACE_PANELS_ID).toBe("auto");
    expect(APPEARANCE_SETTINGS_KEY).toBe("appearance.v1");
    expect(DEFAULT_APPEARANCE_SETTINGS).toEqual({ themeFamily: "fluent", scheme: "dark", panels: "auto" });
  });

  it("accepts only registry ids", () => {
    expect(isThemeId("dark")).toBe(true);
    expect(isThemeId("light")).toBe(true);
    expect(isThemeId("vaporwave")).toBe(false);
    expect(isThemeId(undefined)).toBe(false);
    expect(isThemeId(7)).toBe(false);
    expect(parseThemeId("vaporwave")).toBe("dark");
    expect(parseThemeId("light")).toBe("light");

    expect(isWorkspacePanelsId("auto")).toBe(true);
    expect(isWorkspacePanelsId("drawers")).toBe(true);
    expect(isWorkspacePanelsId("mosaic")).toBe(false);
    expect(parseWorkspacePanelsId("mosaic")).toBe("auto");
  });

  it("falls back per field for a missing, corrupt or partial row", () => {
    const defaults = { themeFamily: "fluent", scheme: "dark", panels: "auto" };
    expect(parseAppearanceSettings(null)).toEqual(defaults);
    expect(parseAppearanceSettings("")).toEqual(defaults);
    expect(parseAppearanceSettings("{not json")).toEqual(defaults);
    expect(parseAppearanceSettings(JSON.stringify({ theme: "vaporwave" }))).toEqual(defaults);
    expect(parseAppearanceSettings(JSON.stringify({}))).toEqual(defaults);
    // A row written before panels existed keeps its theme and gains the default option.
    expect(parseAppearanceSettings(JSON.stringify({ theme: "light" }))).toEqual({
      themeFamily: "fluent",
      scheme: "light",
      panels: "auto",
    });
    // Unknown values fall back per field, so one bad id does not reset the other.
    expect(parseAppearanceSettings(JSON.stringify({ theme: "dark", panels: "mosaic" }))).toEqual(defaults);
    expect(normalizeAppearanceSettings({ theme: "light", panels: "drawers" })).toEqual({
      themeFamily: "fluent",
      scheme: "light",
      panels: "drawers",
    });
  });

  it("round-trips the stored form", () => {
    const stored = { themeFamily: "fluent", scheme: "light", panels: "drawers" } as const;
    expect(parseAppearanceSettings(encodeAppearanceSettings(stored))).toEqual(stored);
  });
});

describe("appearance preference (IPC)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads the stored theme and panels option", async () => {
    vi.stubGlobal("api", {
      getAppearance: vi.fn().mockResolvedValue({ ok: true, data: { theme: "dark", panels: "drawers" } }),
      setAppearance: vi.fn(),
    });

    await expect(loadAppearancePref()).resolves.toEqual({ themeFamily: "fluent", scheme: "dark", panels: "drawers" });
    expect(window.api.getAppearance).toHaveBeenCalled();
  });

  it("applies the defaults when the row is unset, without writing them", async () => {
    const setAppearance = vi.fn();
    vi.stubGlobal("api", {
      getAppearance: vi.fn().mockResolvedValue({ ok: true, data: null }),
      setAppearance,
    });

    await expect(loadAppearancePref()).resolves.toEqual({ themeFamily: "fluent", scheme: "dark", panels: "auto" });
    expect(setAppearance).not.toHaveBeenCalled();
  });

  it("falls back when the read fails or throws", async () => {
    vi.stubGlobal("api", {
      getAppearance: vi.fn().mockResolvedValue({ ok: false, error: "db locked" }),
      setAppearance: vi.fn(),
    });
    await expect(loadAppearancePref()).resolves.toEqual({ themeFamily: "fluent", scheme: "dark", panels: "auto" });

    vi.stubGlobal("api", {
      getAppearance: vi.fn().mockRejectedValue(new Error("No handler")),
      setAppearance: vi.fn(),
    });
    await expect(loadAppearancePref()).resolves.toEqual({ themeFamily: "fluent", scheme: "dark", panels: "auto" });
  });

  it("persists through setAppearance and reports failure", async () => {
    const stored = { themeFamily: "fluent", scheme: "dark", panels: "drawers" } as const;
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
