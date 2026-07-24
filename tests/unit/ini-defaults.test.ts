import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultGameIni, defaultGameUserSettingsIni } from "@shared/ini-defaults";

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

  it("matches shared/defaults files exactly (no wiki merge)", () => {
    const source = readFileSync(join(defaultsDir, "GameUserSettings.ini"), "utf8")
      .replace(/^\uFEFF/, "")
      .replace(/\r\n/g, "\n");
    const normalized = source.endsWith("\n") ? source : `${source}\n`;
    expect(defaultGameUserSettingsIni).toBe(normalized);
  });
});
