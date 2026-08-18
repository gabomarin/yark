import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "@backend/infra/db/database";
import { AppSettingsRepository } from "@backend/infra/db/app-settings-repository";
import {
  OPEN_NATIVE_CONSOLE_SETTING_KEY,
  encodeOpenNativeConsolePref,
  parseStoredOpenNativeConsole,
} from "@shared/open-native-console";
import type { DatabaseSync } from "node:sqlite";

describe("AppSettingsRepository openNativeConsoleOnStart (#350)", () => {
  let db: DatabaseSync;

  afterEach(() => {
    db.close();
  });

  it("persists and reads the native console preference", () => {
    db = openDatabase(":memory:");
    const settings = new AppSettingsRepository(db);

    expect(settings.get(OPEN_NATIVE_CONSOLE_SETTING_KEY)).toBeNull();

    settings.set(OPEN_NATIVE_CONSOLE_SETTING_KEY, encodeOpenNativeConsolePref(true));
    const stored = settings.get(OPEN_NATIVE_CONSOLE_SETTING_KEY);
    expect(stored).toBe("1");
    expect(parseStoredOpenNativeConsole(stored)).toBe(true);

    settings.set(OPEN_NATIVE_CONSOLE_SETTING_KEY, encodeOpenNativeConsolePref(false));
    expect(settings.get(OPEN_NATIVE_CONSOLE_SETTING_KEY)).toBe("0");
    expect(parseStoredOpenNativeConsole(settings.get(OPEN_NATIVE_CONSOLE_SETTING_KEY))).toBe(
      false,
    );
  });
});
