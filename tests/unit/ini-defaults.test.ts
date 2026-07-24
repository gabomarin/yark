import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultGameIni, defaultGameUserSettingsIni } from "@shared/ini-defaults";
import { parseIniTextRows } from "@shared/ini-text";

const defaultsDir = join(__dirname, "../../src/shared/defaults");

describe("ini defaults from shared/defaults", () => {
  it("keeps the attached GameUserSettings.ini as the main body", () => {
    const source = readFileSync(join(defaultsDir, "GameUserSettings.ini"), "utf8");
    expect(defaultGameUserSettingsIni).toContain("[ServerSettings]");
    expect(defaultGameUserSettingsIni).toContain("AdminLogging=False");
    expect(defaultGameUserSettingsIni).toContain("AllowCaveBuildingPvE=False");
    // Comments from the source of truth are preserved.
    expect(defaultGameUserSettingsIni).toContain("If True, logs all admin commands");
    expect(defaultGameUserSettingsIni.length).toBeGreaterThanOrEqual(source.length - 100);
  });

  it("keeps the attached Game.ini as the main body", () => {
    expect(defaultGameIni).toContain("[/script/shootergame.shootergamemode]");
    expect(defaultGameIni).toContain("BabyMatureSpeedMultiplier=1.0");
    expect(defaultGameIni).toContain("bAllowFlyerSpeedLeveling=False");
  });

  it("does not reintroduce client-only session history keys", () => {
    expect(defaultGameUserSettingsIni).not.toContain("LastJoinedSessionPerCategory");
    const keys = parseIniTextRows(defaultGameUserSettingsIni).map((row) => row.key);
    expect(keys.some((key) => /LastJoinedSessionPerCategory/i.test(key))).toBe(false);
  });
});
