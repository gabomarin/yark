import { describe, expect, it } from "vitest";
import parseIni from "ini";
import type { ServerIniPayload } from "@shared/types";
import { applyIniPreset, listIniPresets } from "@shared/ini-presets";

function parseSettings(text: string): Record<string, unknown> {
  return parseIni.parse(text) as Record<string, unknown>;
}

describe("ini-presets", () => {
  it("expone presets comunes disponibles", () => {
    const presets = listIniPresets();
    expect(presets.length).toBeGreaterThanOrEqual(3);
    expect(presets.some((p) => p.id === "pve-basico")).toBe(true);
  });

  it("no modifica payload cuando preset no existe", () => {
    const payload: ServerIniPayload = {
      gameUserSettings: "[ServerSettings]\nRCONPort=27020\n",
      game: "",
    };

    const next = applyIniPreset(payload, "missing-preset");
    expect(next).toEqual(payload);
  });

  it("aplica preset pve básico sin perder llaves existentes", () => {
    const payload: ServerIniPayload = {
      gameUserSettings: [
        "[ServerSettings]",
        "RCONPort=27020",
        "SessionName=Servidor Test",
        "",
      ].join("\n"),
      game: "",
    };

    const next = applyIniPreset(payload, "pve-basico");
    const parsed = parseSettings(next.gameUserSettings);
    const section = parsed["ServerSettings"] as Record<string, unknown>;

    expect(section["RCONPort"]).toBe("27020");
    expect(section["SessionName"]).toBe("Servidor Test");
    expect(section["AllowFlyerCarryPVE"]).toBe("True");
    expect(section["ShowMapPlayerLocation"]).toBe("True");
  });

  it("aplica preset rendimiento sobreescribiendo valores objetivo", () => {
    const payload: ServerIniPayload = {
      gameUserSettings: [
        "[ServerSettings]",
        "MaxPlayers=120",
        "NetServerMaxTickRate=20",
        "",
      ].join("\n"),
      game: "",
    };

    const next = applyIniPreset(payload, "rendimiento");
    const parsed = parseSettings(next.gameUserSettings);
    const section = parsed["ServerSettings"] as Record<string, unknown>;

    expect(section["MaxPlayers"]).toBe("70");
    expect(section["NetServerMaxTickRate"]).toBe("30");
  });
});
