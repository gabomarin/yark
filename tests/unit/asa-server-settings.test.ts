import { describe, expect, it } from "vitest";
import {
  asaServerSettings,
  asaServerSettingsMeta,
  buildDefaultIniText,
  lookupAsaDefaultValue,
  lookupAsaDescription,
  lookupAsaSetting,
} from "@shared/asa-server-settings";
import {
  iniSettingMetaStats,
  lookupIniSettingInput,
  lookupIniSettingMeta,
} from "@shared/ini-setting-meta";
import { defaultGameIni, defaultGameUserSettingsIni } from "@shared/ini-defaults";
import { isClientIniKey } from "@shared/ini-text";

describe("ini-setting-meta (defaults-derived)", () => {
  it("exposes settings generated from defaults", () => {
    expect(iniSettingMetaStats.total).toBeGreaterThanOrEqual(250);
    expect(iniSettingMetaStats.gusCount).toBeGreaterThanOrEqual(150);
    expect(iniSettingMetaStats.gameCount).toBeGreaterThanOrEqual(80);
    expect(asaServerSettings.length).toBe(iniSettingMetaStats.total);
    expect(asaServerSettingsMeta.gusCount).toBe(iniSettingMetaStats.gusCount);
    expect(asaServerSettingsMeta.wikiOnly).toBe(0);
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

  it("returns a non-empty AdminLogging description from defaults comments", () => {
    const description = lookupAsaDescription(
      "gameUserSettings",
      "ServerSettings",
      "AdminLogging",
    );
    expect(description && description.length > 0).toBe(true);
  });

  it("infers boolean / range inputs from comments", () => {
    expect(
      lookupIniSettingInput("gameUserSettings", "ServerSettings", "AdminLogging"),
    ).toEqual({ type: "boolean" });
    const fishing = lookupIniSettingMeta(
      "game",
      "/script/shootergame.shootergamemode",
      "FishingLootQualityMultiplier",
    );
    expect(fishing?.input.type).toBe("range");
    if (fishing?.input.type === "range") {
      expect(fishing.input.min).toBe(1);
      expect(fishing.input.max).toBe(5);
    }
  });

  it("does not clamp integers with non-negative defaults to min 0", () => {
    const chatLogAge = lookupIniSettingInput(
      "gameUserSettings",
      "ServerSettings",
      "ChatLogMaxAgeInDays",
    );
    expect(chatLogAge).toEqual({ type: "number", integer: true, step: 1 });
  });

  it("keeps KillXPMultiplier description unpolluted by neighboring templates", () => {
    const description = lookupAsaDescription(
      "game",
      "/script/shootergame.shootergamemode",
      "KillXPMultiplier",
    );
    expect(description).toMatch(/XP earned for a kill/i);
    expect(description).not.toMatch(/ItemStatClamps/i);
  });

  it("runtime defaults still come from shared/defaults files", () => {
    expect(defaultGameUserSettingsIni).toContain("[ServerSettings]");
    expect(defaultGameUserSettingsIni).toMatch(/AutoSavePeriodMinutes=/i);
    expect(defaultGameIni).toContain("BabyMatureSpeedMultiplier");
    expect(buildDefaultIniText("gameUserSettings")).toMatch(/AutoSavePeriodMinutes=/i);
    expect(buildDefaultIniText("game")).toMatch(/BabyMatureSpeedMultiplier=/i);
  });

  it("still treats LastJoinedSessionPerCategory as client noise", () => {
    expect(isClientIniKey("LastJoinedSessionPerCategory")).toBe(true);
  });

  it("does not include ASE-only ActiveEvent", () => {
    expect(defaultGameUserSettingsIni).not.toMatch(/^\s*ActiveEvent=/im);
    expect(asaServerSettings.some((s) => s.key === "ActiveEvent")).toBe(false);
  });
});
