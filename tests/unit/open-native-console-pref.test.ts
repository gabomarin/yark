import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_OPEN_NATIVE_CONSOLE,
  OPEN_NATIVE_CONSOLE_LEGACY_LOCAL_STORAGE_KEY,
  OPEN_NATIVE_CONSOLE_SETTING_KEY,
  encodeOpenNativeConsolePref,
  parseOpenNativeConsolePref,
  parseStoredOpenNativeConsole,
} from "@shared/open-native-console";
import {
  loadOpenNativeConsolePref,
  writeOpenNativeConsolePref,
} from "@features/settings/settingsModel";

describe("open native console shared helpers", () => {
  it("parses stored values and falls back to off", () => {
    expect(parseStoredOpenNativeConsole("1")).toBe(true);
    expect(parseStoredOpenNativeConsole("true")).toBe(true);
    expect(parseStoredOpenNativeConsole("0")).toBe(false);
    expect(parseStoredOpenNativeConsole("false")).toBe(false);
    expect(parseStoredOpenNativeConsole(null)).toBeNull();
    expect(parseStoredOpenNativeConsole("maybe")).toBeNull();
    expect(parseOpenNativeConsolePref(null)).toBe(DEFAULT_OPEN_NATIVE_CONSOLE);
    expect(parseOpenNativeConsolePref("1")).toBe(true);
    expect(encodeOpenNativeConsolePref(true)).toBe("1");
    expect(encodeOpenNativeConsolePref(false)).toBe("0");
  });

  it("uses the SQLite app_settings key openNativeConsoleOnStart", () => {
    expect(OPEN_NATIVE_CONSOLE_SETTING_KEY).toBe("openNativeConsoleOnStart");
    expect(DEFAULT_OPEN_NATIVE_CONSOLE).toBe(false);
  });
});

describe("open native console preference (IPC + legacy migration)", () => {
  afterEach(() => {
    window.localStorage.removeItem(OPEN_NATIVE_CONSOLE_LEGACY_LOCAL_STORAGE_KEY);
    vi.unstubAllGlobals();
  });

  it("loads from app_settings when present", async () => {
    vi.stubGlobal("api", {
      getOpenNativeConsole: vi.fn().mockResolvedValue({ ok: true, data: true }),
      setOpenNativeConsole: vi.fn(),
    });

    await expect(loadOpenNativeConsolePref()).resolves.toBe(true);
    expect(window.api.getOpenNativeConsole).toHaveBeenCalled();
  });

  it("defaults to off when unset and no legacy value", async () => {
    vi.stubGlobal("api", {
      getOpenNativeConsole: vi.fn().mockResolvedValue({ ok: true, data: null }),
      setOpenNativeConsole: vi.fn(),
    });

    await expect(loadOpenNativeConsolePref()).resolves.toBe(false);
    expect(window.api.setOpenNativeConsole).not.toHaveBeenCalled();
  });

  it("migrates legacy localStorage into app_settings once", async () => {
    window.localStorage.setItem(OPEN_NATIVE_CONSOLE_LEGACY_LOCAL_STORAGE_KEY, "1");
    const setOpenNativeConsole = vi.fn().mockResolvedValue({ ok: true, data: true });
    vi.stubGlobal("api", {
      getOpenNativeConsole: vi.fn().mockResolvedValue({ ok: true, data: null }),
      setOpenNativeConsole,
    });

    await expect(loadOpenNativeConsolePref()).resolves.toBe(true);
    expect(setOpenNativeConsole).toHaveBeenCalledWith(true);
    expect(window.localStorage.getItem(OPEN_NATIVE_CONSOLE_LEGACY_LOCAL_STORAGE_KEY)).toBeNull();
  });

  it("keeps legacy localStorage when migration write fails", async () => {
    window.localStorage.setItem(OPEN_NATIVE_CONSOLE_LEGACY_LOCAL_STORAGE_KEY, "1");
    const setOpenNativeConsole = vi.fn().mockResolvedValue({ ok: false, error: "db locked" });
    vi.stubGlobal("api", {
      getOpenNativeConsole: vi.fn().mockResolvedValue({ ok: true, data: null }),
      setOpenNativeConsole,
    });

    await expect(loadOpenNativeConsolePref()).resolves.toBe(true);
    expect(window.localStorage.getItem(OPEN_NATIVE_CONSOLE_LEGACY_LOCAL_STORAGE_KEY)).toBe(
      "1",
    );
  });

  it("falls back when getOpenNativeConsole returns ok:false", async () => {
    vi.stubGlobal("api", {
      getOpenNativeConsole: vi.fn().mockResolvedValue({ ok: false, error: "db locked" }),
      setOpenNativeConsole: vi.fn(),
    });

    await expect(loadOpenNativeConsolePref()).resolves.toBe(false);
    expect(window.api.setOpenNativeConsole).not.toHaveBeenCalled();
  });

  it("falls back when getOpenNativeConsole IPC throws", async () => {
    window.localStorage.setItem(OPEN_NATIVE_CONSOLE_LEGACY_LOCAL_STORAGE_KEY, "1");
    vi.stubGlobal("api", {
      getOpenNativeConsole: vi.fn().mockRejectedValue(new Error("No handler")),
      setOpenNativeConsole: vi.fn(),
    });

    await expect(loadOpenNativeConsolePref()).resolves.toBe(true);
  });

  it("persists changes through setOpenNativeConsole IPC", async () => {
    const setOpenNativeConsole = vi.fn().mockResolvedValue({ ok: true, data: true });
    vi.stubGlobal("api", {
      getOpenNativeConsole: vi.fn(),
      setOpenNativeConsole,
    });

    await expect(writeOpenNativeConsolePref(true)).resolves.toBe(true);
    expect(setOpenNativeConsole).toHaveBeenCalledWith(true);
  });

  it("returns false when setOpenNativeConsole fails", async () => {
    vi.stubGlobal("api", {
      getOpenNativeConsole: vi.fn(),
      setOpenNativeConsole: vi.fn().mockResolvedValue({ ok: false, error: "db locked" }),
    });

    await expect(writeOpenNativeConsolePref(true)).resolves.toBe(false);
  });

  it("returns false when setOpenNativeConsole throws", async () => {
    vi.stubGlobal("api", {
      getOpenNativeConsole: vi.fn(),
      setOpenNativeConsole: vi.fn().mockRejectedValue(new Error("No handler")),
    });

    await expect(writeOpenNativeConsolePref(true)).resolves.toBe(false);
  });
});
