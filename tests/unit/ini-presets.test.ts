import { describe, expect, it } from "vitest";
import type { ServerIniPayload } from "@shared/types";
import { applyIniPreset, listIniPresets } from "@shared/ini-presets";
import { parseIniTextRows, setIniTextValue } from "@shared/ini-text";

describe("ini-presets", () => {
  it("exposes available common presets", () => {
    const presets = listIniPresets();
    expect(presets.length).toBeGreaterThanOrEqual(3);
    expect(presets.some((p) => p.id === "pve-basic")).toBe(true);
  });

  it("does not modify payload when preset does not exist", () => {
    const payload: ServerIniPayload = {
      gameUserSettings: "[ServerSettings]\nRCONPort=27020\n",
      game: "",
    };

    const next = applyIniPreset(payload, "missing-preset");
    expect(next).toEqual(payload);
  });

  it("applies basic PvE preset without losing existing keys", () => {
    const payload: ServerIniPayload = {
      gameUserSettings: [
        "[ServerSettings]",
        "RCONPort=27020",
        "SessionName=Server Test",
        "",
      ].join("\n"),
      game: "",
    };

    const next = applyIniPreset(payload, "pve-basic");
    const rows = parseIniTextRows(next.gameUserSettings);
    const byKey = Object.fromEntries(
      rows.filter((row) => row.section === "ServerSettings").map((row) => [row.key, row.value]),
    );

    expect(byKey["RCONPort"]).toBe("27020");
    expect(byKey["SessionName"]).toBe("Server Test");
    expect(byKey["AllowFlyerCarryPVE"]).toBe("True");
    expect(byKey["ShowMapPlayerLocation"]).toBe("True");
  });

  it("applies performance preset overwriting target values", () => {
    const payload: ServerIniPayload = {
      gameUserSettings: [
        "[ServerSettings]",
        "MaxPlayers=120",
        "NetServerMaxTickRate=20",
        "",
      ].join("\n"),
      game: "",
    };

    const next = applyIniPreset(payload, "performance");
    const rows = parseIniTextRows(next.gameUserSettings);
    const byKey = Object.fromEntries(
      rows.filter((row) => row.section === "ServerSettings").map((row) => [row.key, row.value]),
    );

    expect(byKey["MaxPlayers"]).toBe("70");
    expect(byKey["NetServerMaxTickRate"]).toBe("30");
  });

  it("updates dotted sections without nesting them", () => {
    const text = setIniTextValue(
      "[/Script/Engine.GameSession]\nMaxPlayers=10\n",
      "/Script/Engine.GameSession",
      "MaxPlayers",
      "70",
    );
    const rows = parseIniTextRows(text);
    expect(rows[0]).toEqual({
      section: "/Script/Engine.GameSession",
      key: "MaxPlayers",
      value: "70",
    });
  });
});
