import { describe, expect, it } from "vitest";
import {
  asaServerSettings,
  asaServerSettingsMeta,
  buildDefaultIniText,
  lookupAsaDefaultValue,
  lookupAsaDescription,
  lookupAsaSetting,
} from "../../src/shared/asa-server-settings";
import { defaultGameIni, defaultGameUserSettingsIni } from "../../src/shared/ini-defaults";
import { isClientIniKey } from "../../src/shared/ini-text";

describe("asa-server-settings catalog", () => {
  it("exposes approximate ASA catalog counts", () => {
    expect(asaServerSettings.length).toBeGreaterThanOrEqual(300);
    expect(asaServerSettingsMeta.gusCount).toBeGreaterThanOrEqual(200);
    expect(asaServerSettingsMeta.gameCount).toBeGreaterThanOrEqual(100);
    expect(
      asaServerSettings.filter((s) => s.file === "gameUserSettings").length,
    ).toBe(asaServerSettingsMeta.gusCount);
    expect(asaServerSettings.filter((s) => s.file === "game").length).toBe(
      asaServerSettingsMeta.gameCount,
    );
  });

  it("looks up AdminLogging case-insensitively by section and key", () => {
    const setting = lookupAsaSetting(
      "gameUserSettings",
      "serversettings",
      "adminlogging",
    );
    expect(setting?.key).toBe("AdminLogging");
    const value = lookupAsaDefaultValue(
      "gameUserSettings",
      "serversettings",
      "adminlogging",
    );
    expect(value?.toLowerCase()).toBe("false");
  });

  it("returns a non-empty AdminLogging description", () => {
    const description = lookupAsaDescription(
      "gameUserSettings",
      "ServerSettings",
      "AdminLogging",
    );
    expect(description && description.length > 0).toBe(true);
  });

  it("builds GameUserSettings defaults with ServerSettings and AutoSavePeriodMinutes", () => {
    expect(defaultGameUserSettingsIni).toContain("[ServerSettings]");
    expect(defaultGameUserSettingsIni).toMatch(/AutoSavePeriodMinutes=/i);
    // Catalog-only builder still works for tooling; runtime defaults come from shared/defaults.
    const fromCatalogOnly = buildDefaultIniText("gameUserSettings");
    expect(fromCatalogOnly).toContain("[ServerSettings]");
    expect(fromCatalogOnly).toMatch(/AutoSavePeriodMinutes=/i);
  });

  it("does not merge wiki catalog additions into runtime defaults", () => {
    expect(defaultGameUserSettingsIni).not.toContain("ASA catalog additions");
    expect(defaultGameIni).not.toContain("ASA catalog additions");
  });

  it("builds Game.ini defaults with BabyMatureSpeedMultiplier", () => {
    expect(defaultGameIni).toContain("BabyMatureSpeedMultiplier");
    expect(defaultGameIni).toMatch(/BabyMatureSpeedMultiplier=/i);
    expect(buildDefaultIniText("game")).toMatch(/BabyMatureSpeedMultiplier=/i);
  });

  it("still treats LastJoinedSessionPerCategory as client noise", () => {
    expect(isClientIniKey("LastJoinedSessionPerCategory")).toBe(true);
  });

  it("does not include ASE-only ActiveEvent in defaults", () => {
    expect(defaultGameUserSettingsIni).not.toMatch(/^\s*ActiveEvent=/im);
    expect(defaultGameIni).not.toMatch(/^\s*ActiveEvent=/im);
    expect(asaServerSettings.some((s) => s.key === "ActiveEvent")).toBe(false);
  });
});
