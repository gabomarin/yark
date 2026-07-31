import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "@backend/infra/db/database";
import { AppSettingsRepository } from "@backend/infra/db/app-settings-repository";
import {
  CLOSE_WINDOW_TO_TRAY_SETTING_KEY,
  DEFAULT_CLOSE_WINDOW_TO_TRAY,
  DEFAULT_START_WITH_WINDOWS,
  START_WITH_WINDOWS_SETTING_KEY,
  TRAY_CLOSE_HINT_DISMISSED_SETTING_KEY,
  parseStoredBoolean,
  serializeStoredBoolean,
} from "@shared/desktop-shell";
import {
  readDesktopShellPreferences,
  setCloseWindowToTray,
  setTrayCloseHintDismissed,
} from "../../src/main/desktop-shell-settings";
import type { DatabaseSync } from "node:sqlite";

describe("desktop shell preferences (#54)", () => {
  let db: DatabaseSync;

  afterEach(() => {
    db?.close();
  });

  it("parseStoredBoolean respects defaults and common truthy/falsey strings", () => {
    expect(parseStoredBoolean(null, true)).toBe(true);
    expect(parseStoredBoolean(undefined, false)).toBe(false);
    expect(parseStoredBoolean("true", false)).toBe(true);
    expect(parseStoredBoolean("0", true)).toBe(false);
    expect(parseStoredBoolean("nope", true)).toBe(true);
    expect(serializeStoredBoolean(true)).toBe("true");
    expect(serializeStoredBoolean(false)).toBe("false");
  });

  it("defaults close-to-tray on and start-with-Windows off when unset", () => {
    db = openDatabase(":memory:");
    const settings = new AppSettingsRepository(db);
    const prefs = readDesktopShellPreferences(settings);

    expect(prefs.closeWindowToTray).toBe(DEFAULT_CLOSE_WINDOW_TO_TRAY);
    expect(prefs.startWithWindows).toBe(DEFAULT_START_WITH_WINDOWS);
    expect(prefs.trayCloseHintDismissed).toBe(false);
    expect(settings.get(CLOSE_WINDOW_TO_TRAY_SETTING_KEY)).toBeNull();
    expect(settings.get(START_WITH_WINDOWS_SETTING_KEY)).toBeNull();
  });

  it("persists close-to-tray and tray hint dismissal", () => {
    db = openDatabase(":memory:");
    const settings = new AppSettingsRepository(db);

    expect(setCloseWindowToTray(settings, false)).toBe(false);
    expect(settings.get(CLOSE_WINDOW_TO_TRAY_SETTING_KEY)).toBe("false");
    expect(readDesktopShellPreferences(settings).closeWindowToTray).toBe(false);

    setTrayCloseHintDismissed(settings, true);
    expect(settings.get(TRAY_CLOSE_HINT_DISMISSED_SETTING_KEY)).toBe("true");
    expect(readDesktopShellPreferences(settings).trayCloseHintDismissed).toBe(true);
  });
});
