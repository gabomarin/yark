import { describe, expect, it } from "vitest";
import {
  parseIniTextRows,
  sectionShortName,
  setIniTextValue,
  stripClientIniKeys,
} from "../../src/shared/ini-text";
import {
  filterIniRows,
  inferControlKind,
  isClientNoiseKey,
  parseIniRows,
  resolveControlKind,
  setIniValue,
} from "../../src/renderer/src/features/server-workspace/iniModel";

describe("ini-text / iniModel section parsing", () => {
  const sample = `[/Script/Engine.GameSession]
MaxPlayers=70

[/Script/ShooterGame.ShooterGameUserSettings]
bUseVSync=False
ResolutionSizeX=1280
LastJoinedSessionPerCategory=Uno
LastJoinedSessionPerCategory=Dos
LastJoinedSessionPerCategory=Tres
`;

  it("treats dotted bracket headers as literal sections", () => {
    const rows = parseIniTextRows(sample);
    expect(rows.find((row) => row.key === "MaxPlayers")).toEqual({
      section: "/Script/Engine.GameSession",
      key: "MaxPlayers",
      value: "70",
    });
  });

  it("keeps duplicate unreal keys as separate occurrences", () => {
    const rows = parseIniRows(sample).filter(
      (row) => row.key === "LastJoinedSessionPerCategory",
    );
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.value)).toEqual(["Uno", "Dos", "Tres"]);
    expect(rows.map((row) => row.occurrence)).toEqual([0, 1, 2]);
    expect(rows[0]?.duplicateCount).toBe(3);
  });

  it("strips client sections/keys so they are never persisted for dedicated servers", () => {
    const cleaned = stripClientIniKeys(sample);
    expect(cleaned).toContain("MaxPlayers=70");
    expect(cleaned).not.toContain("ShooterGameUserSettings");
    expect(cleaned).not.toContain("ResolutionSizeX");
    expect(cleaned).not.toContain("LastJoinedSessionPerCategory");
    expect(cleaned).not.toContain("bUseVSync");
  });

  it("hides client graphics sections from dedicated editor filters", () => {
    expect(isClientNoiseKey("LastJoinedSessionPerCategory")).toBe(true);
    expect(isClientNoiseKey("GraphicsQuality", "/Script/ShooterGame.ShooterGameUserSettings")).toBe(
      true,
    );
    expect(isClientNoiseKey("sg.ShadowQuality", "ScalabilityGroups")).toBe(true);
    expect(isClientNoiseKey("MaxPlayers", "/Script/Engine.GameSession")).toBe(false);
    expect(inferControlKind("True")).toBe("boolean");
    const rows = parseIniRows(sample);
    const filtered = filterIniRows(rows, "", "all");
    expect(filtered.some((row) => row.key === "LastJoinedSessionPerCategory")).toBe(false);
    expect(filtered.some((row) => row.key === "ResolutionSizeX")).toBe(false);
    expect(filtered.some((row) => row.key === "MaxPlayers")).toBe(true);
  });

  it("updates a specific duplicate occurrence", () => {
    const next = setIniTextValue(
      sample,
      "/Script/ShooterGame.ShooterGameUserSettings",
      "LastJoinedSessionPerCategory",
      "Nuevo",
      1,
    );
    const rows = parseIniRows(next).filter(
      (row) => row.key === "LastJoinedSessionPerCategory",
    );
    expect(rows.map((row) => row.value)).toEqual(["Uno", "Nuevo", "Tres"]);
  });

  it("exposes a short category name from the last segment", () => {
    expect(sectionShortName("/Script/Engine.GameSession")).toBe("GameSession");
    expect(sectionShortName("ServerSettings")).toBe("ServerSettings");
  });

  it("updates a value inside a dotted section without rewriting structure", () => {
    const next = setIniValue(sample, "/Script/Engine.GameSession", "MaxPlayers", "40");
    expect(next).toContain("[/Script/Engine.GameSession]");
    expect(next).toContain("MaxPlayers=40");
  });

  it("keeps string settings as text even when the value looks numeric", () => {
    expect(
      resolveControlKind("928988", {
        valueType: "list of mod IDs, comma-separated with no spaces",
        key: "ActiveMods",
      }),
    ).toBe("text");
    expect(
      resolveControlKind("1", {
        valueType: "string",
        key: "SessionName",
      }),
    ).toBe("text");
    expect(
      resolveControlKind("1234", { key: "ServerPassword" }),
    ).toBe("text");
    expect(
      resolveControlKind("70", {
        valueType: "integer",
        key: "MaxPlayers",
      }),
    ).toBe("number");
    expect(resolveControlKind("True", { valueType: "boolean" })).toBe("boolean");
  });
});
