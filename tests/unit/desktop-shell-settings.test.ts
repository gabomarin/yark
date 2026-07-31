import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "@backend/infra/db/database";
import { AppSettingsRepository } from "@backend/infra/db/app-settings-repository";
import {
  CLOSE_WINDOW_TO_TRAY_SETTING_KEY,
  DEFAULT_CLOSE_WINDOW_TO_TRAY,
  DEFAULT_ON_QUIT_WITH_ACTIVE_SERVERS,
  DEFAULT_START_WITH_WINDOWS,
  ON_QUIT_WITH_ACTIVE_SERVERS_SETTING_KEY,
  START_WITH_WINDOWS_SETTING_KEY,
  TRAY_CLOSE_HINT_DISMISSED_SETTING_KEY,
  parseOnQuitWithActiveServers,
  parseStoredBoolean,
  serializeStoredBoolean,
} from "@shared/desktop-shell";
import {
  readDesktopShellPreferences,
  setCloseWindowToTray,
  setOnQuitWithActiveServers,
  setTrayCloseHintDismissed,
} from "../../src/main/desktop-shell-settings";
import type { DatabaseSync } from "node:sqlite";

describe("desktop shell preferences (#54 / #59)", () => {
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

  it("parseOnQuitWithActiveServers defaults to ask and rejects unknown values", () => {
    expect(parseOnQuitWithActiveServers(null)).toBe("ask");
    expect(parseOnQuitWithActiveServers("stop")).toBe("stop");
    expect(parseOnQuitWithActiveServers("LEAVE")).toBe("leave");
    expect(parseOnQuitWithActiveServers("nope")).toBe(DEFAULT_ON_QUIT_WITH_ACTIVE_SERVERS);
  });

  it("defaults close-to-tray on, start-with-Windows off, and quit policy ask", () => {
    db = openDatabase(":memory:");
    const settings = new AppSettingsRepository(db);
    const prefs = readDesktopShellPreferences(settings);

    expect(prefs.closeWindowToTray).toBe(DEFAULT_CLOSE_WINDOW_TO_TRAY);
    expect(prefs.startWithWindows).toBe(DEFAULT_START_WITH_WINDOWS);
    expect(prefs.trayCloseHintDismissed).toBe(false);
    expect(prefs.onQuitWithActiveServers).toBe(DEFAULT_ON_QUIT_WITH_ACTIVE_SERVERS);
    expect(settings.get(CLOSE_WINDOW_TO_TRAY_SETTING_KEY)).toBeNull();
    expect(settings.get(START_WITH_WINDOWS_SETTING_KEY)).toBeNull();
    expect(settings.get(ON_QUIT_WITH_ACTIVE_SERVERS_SETTING_KEY)).toBeNull();
  });

  it("persists close-to-tray, tray hint dismissal, and quit policy", () => {
    db = openDatabase(":memory:");
    const settings = new AppSettingsRepository(db);

    expect(setCloseWindowToTray(settings, false)).toBe(false);
    expect(settings.get(CLOSE_WINDOW_TO_TRAY_SETTING_KEY)).toBe("false");
    expect(readDesktopShellPreferences(settings).closeWindowToTray).toBe(false);

    setTrayCloseHintDismissed(settings, true);
    expect(settings.get(TRAY_CLOSE_HINT_DISMISSED_SETTING_KEY)).toBe("true");
    expect(readDesktopShellPreferences(settings).trayCloseHintDismissed).toBe(true);

    expect(setTrayCloseHintDismissed(settings, false)).toBe(false);
    expect(readDesktopShellPreferences(settings).trayCloseHintDismissed).toBe(false);

    expect(setOnQuitWithActiveServers(settings, "leave")).toBe("leave");
    expect(settings.get(ON_QUIT_WITH_ACTIVE_SERVERS_SETTING_KEY)).toBe("leave");
    expect(readDesktopShellPreferences(settings).onQuitWithActiveServers).toBe("leave");
  });
});
