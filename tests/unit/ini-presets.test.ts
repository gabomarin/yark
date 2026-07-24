import { describe, expect, it } from "vitest";
import type { ServerIniPayload } from "@shared/types";
import { applyIniPreset, listIniPresets } from "@shared/ini-presets";
import { parseIniTextRows, setIniTextValue } from "@shared/ini-text";

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
    const rows = parseIniTextRows(next.gameUserSettings);
    const byKey = Object.fromEntries(
      rows.filter((row) => row.section === "ServerSettings").map((row) => [row.key, row.value]),
    );

    expect(byKey["RCONPort"]).toBe("27020");
    expect(byKey["SessionName"]).toBe("Servidor Test");
    expect(byKey["AllowFlyerCarryPVE"]).toBe("True");
    expect(byKey["ShowMapPlayerLocation"]).toBe("True");
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
    const rows = parseIniTextRows(next.gameUserSettings);
    const byKey = Object.fromEntries(
      rows.filter((row) => row.section === "ServerSettings").map((row) => [row.key, row.value]),
    );

    expect(byKey["MaxPlayers"]).toBe("70");
    expect(byKey["NetServerMaxTickRate"]).toBe("30");
  });

  it("actualiza secciones con puntos sin anidarlas", () => {
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
