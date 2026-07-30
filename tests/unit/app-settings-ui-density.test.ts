import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "@backend/infra/db/database";
import { AppSettingsRepository } from "@backend/infra/db/app-settings-repository";
import { UI_DENSITY_SETTING_KEY, isUiDensity } from "@shared/ui-density";
import type { DatabaseSync } from "node:sqlite";

describe("AppSettingsRepository uiDensity (#62)", () => {
  let db: DatabaseSync;

  afterEach(() => {
    db.close();
  });

  it("persists and reads the UI density preference", () => {
    db = openDatabase(":memory:");
    const settings = new AppSettingsRepository(db);

    expect(settings.get(UI_DENSITY_SETTING_KEY)).toBeNull();

    settings.set(UI_DENSITY_SETTING_KEY, "comfortable");
    const stored = settings.get(UI_DENSITY_SETTING_KEY);
    expect(stored).toBe("comfortable");
    expect(isUiDensity(stored)).toBe(true);

    settings.set(UI_DENSITY_SETTING_KEY, "compact");
    expect(settings.get(UI_DENSITY_SETTING_KEY)).toBe("compact");
  });
});
