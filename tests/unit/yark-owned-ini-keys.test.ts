import { describe, expect, it } from "vitest";
import {
  isLegacyServerSettingsMaxPlayers,
  isYarkOwnedIniKey,
  stripYarkOwnedFromPayload,
  stripYarkOwnedIniKeys,
  YARK_OWNED_INI_KEYS,
} from "@shared/yark-owned-ini-keys";

describe("yark-owned-ini-keys", () => {
  it("lists profile-synced and ASE-legacy GameUserSettings keys", () => {
    const keys = YARK_OWNED_INI_KEYS.map((entry) => entry.key).sort();
    expect(keys).toEqual(
      [
        "ActiveMapMod",
        "ActiveMods",
        "ActiveTotalConversion",
        "MaxPlayers",
        "Port",
        "QueryPort",
        "RCONEnabled",
        "RCONPort",
        "ServerAdminPassword",
        "ServerPassword",
        "SessionName",
      ].sort(),
    );
    expect(
      YARK_OWNED_INI_KEYS.filter((entry) => entry.reason === "aseLegacy").map(
        (entry) => entry.key,
      ),
    ).toEqual(
      expect.arrayContaining([
        "ActiveMods",
        "ActiveMapMod",
        "ActiveTotalConversion",
      ]),
    );
  });

  it("matches owned keys case-insensitively", () => {
    expect(isYarkOwnedIniKey("SessionSettings", "SessionName")).toBe(true);
    expect(isYarkOwnedIniKey("sessionsettings", "sessionname")).toBe(true);
    expect(isYarkOwnedIniKey("ServerSettings", "ActiveMods")).toBe(true);
    expect(isYarkOwnedIniKey("ServerSettings", "MaxPlayers")).toBe(false);
    expect(isYarkOwnedIniKey("/Script/Engine.GameSession", "MaxPlayers")).toBe(
      true,
    );
    expect(isLegacyServerSettingsMaxPlayers("ServerSettings", "MaxPlayers")).toBe(
      true,
    );
    expect(isLegacyServerSettingsMaxPlayers("serversettings", "maxplayers")).toBe(
      true,
    );
    expect(
      isLegacyServerSettingsMaxPlayers("/Script/Engine.GameSession", "MaxPlayers"),
    ).toBe(false);
  });

  it("strips owned keys while preserving other settings and comments", () => {
    const input = `[ServerSettings]
; keep me
MaxPlayers=40
ActiveMods=111,222
ActiveMapMod=333
RCONPort=27020
ServerAdminPassword=secret
DifficultyOffset=0.5

[SessionSettings]
SessionName=My Map
Port=7777
QueryPort=27015

[/Script/Engine.GameSession]
MaxPlayers=70
`;
    const stripped = stripYarkOwnedIniKeys(input);
    expect(stripped).toContain("MaxPlayers=40");
    expect(stripped).toContain("DifficultyOffset=0.5");
    expect(stripped).toContain("; keep me");
    expect(stripped).not.toMatch(/\[\/Script\/Engine\.GameSession\]/i);
    expect(stripped).not.toMatch(/ActiveMods=/i);
    expect(stripped).not.toMatch(/ActiveMapMod=/i);
    expect(stripped).not.toMatch(/RCONPort=/i);
    expect(stripped).not.toMatch(/ServerAdminPassword=/i);
    expect(stripped).not.toMatch(/SessionName=/i);
    expect(stripped).not.toMatch(/^Port=/im);
    expect(stripped).not.toMatch(/QueryPort=/i);
    // SessionSettings becomes empty after strip → section dropped
    expect(stripped).not.toMatch(/\[SessionSettings\]/i);
  });

  it("strips only GameUserSettings in a payload", () => {
    const result = stripYarkOwnedFromPayload({
      gameUserSettings: `[ServerSettings]\nActiveMods=1\n[SessionSettings]\nSessionName=X\nPort=1\n`,
      game: `[/Script/ShooterGame.ShooterGameMode]\nHarvestAmountMultiplier=2\n`,
    });
    expect(result.gameUserSettings.trim()).toBe("");
    expect(result.game).toContain("HarvestAmountMultiplier=2");
  });
});
