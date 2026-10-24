import { describe, expect, it } from "vitest";
import {
  buildIniImportCompatibilityReport,
  formatIniImportKeptSummary,
  formatIniImportReplacement,
  type IniImportProfile,
} from "@shared/ini/ini-import-compatibility";
import type { ServerIniPayload } from "@shared/types";

const profile: IniImportProfile = {
  sessionName: "Island",
  gamePort: 7777,
  queryPort: 27015,
  rconPort: 27020,
  adminPassword: "secret-admin",
  serverPassword: "secret-join",
};

function payload(gameUserSettings: string, game = ""): ServerIniPayload {
  return { gameUserSettings, game };
}

const matchingGus = `[SessionSettings]
SessionName=Island
Port=7777
QueryPort=27015

[ServerSettings]
RCONEnabled=True
RCONPort=27020
ServerAdminPassword=secret-admin
ServerPassword=secret-join
XPMultiplier=2
`;

describe("buildIniImportCompatibilityReport", () => {
  it("lists no replacements when the server form already matches the file", () => {
    const report = buildIniImportCompatibilityReport(profile, payload(matchingGus));
    expect(report.replacements).toEqual([]);
  });

  it("marks only the identity fields that differ", () => {
    const report = buildIniImportCompatibilityReport(
      profile,
      payload(`[SessionSettings]
SessionName=Old Island
Port=7778
QueryPort=27015

[ServerSettings]
RCONEnabled=False
RCONPort=27020
ServerAdminPassword=secret-admin
ServerPassword=secret-join
XPMultiplier=2
`),
    );
    expect(report.replacements.map((field) => field.id)).toEqual(["sessionName", "gamePort", "rconEnabled"]);
    expect(report.replacements.find((field) => field.id === "sessionName")).toMatchObject({
      fileValue: "Old Island",
      profileValue: "Island",
    });
    expect(report.replacements.find((field) => field.id === "gamePort")?.fileValue).toBe("7778");
    const session = report.replacements.find((field) => field.id === "sessionName");
    expect(session).toBeDefined();
    expect(formatIniImportReplacement(session!)).toBe(
      'Session name in GameUserSettings.ini: "Old Island".\nSession name in YARK: "Island".',
    );
  });

  it("treats RCON true in any casing as already on", () => {
    const report = buildIniImportCompatibilityReport(
      profile,
      payload(matchingGus.replace("RCONEnabled=True", "RCONEnabled=true")),
    );
    expect(report.replacements.map((field) => field.id)).not.toContain("rconEnabled");
  });

  it("does not invent a catalog value for a missing rate", () => {
    const report = buildIniImportCompatibilityReport(profile, payload(matchingGus.replace("XPMultiplier=2\n", "")));
    expect(report.replacements.map((field) => field.id)).not.toContain("XPMultiplier");
    expect(JSON.stringify(report)).not.toContain("DifficultyOffset");
  });

  it("keeps stack and spawn lines and records the complex parse status", () => {
    const game = `[/Script/ShooterGame.ShooterGameMode]
XPMultiplier=1
ConfigAddNPCSpawnEntriesContainer=(AnEntryName="Beach")
ConfigOverrideItemMaxQuantity=(hello world)
`;
    const report = buildIniImportCompatibilityReport(profile, payload(matchingGus, game));
    expect(report.keptComplex).toEqual([
      {
        fileKey: "game",
        section: "/Script/ShooterGame.ShooterGameMode",
        key: "ConfigAddNPCSpawnEntriesContainer",
        occurrence: 0,
        status: "supported",
      },
      {
        fileKey: "game",
        section: "/Script/ShooterGame.ShooterGameMode",
        key: "ConfigOverrideItemMaxQuantity",
        occurrence: 0,
        status: "unknown",
      },
    ]);
    expect(report.keptScalarCount).toBeGreaterThan(0);
    expect(report.replacements).toEqual([]);
    expect(formatIniImportKeptSummary(report)).toBe("1 line stays as it is. 1 stays word for word.");
  });

  it("shows the session name YARK will save when the file hides a tab in it", () => {
    const report = buildIniImportCompatibilityReport(
      profile,
      payload(matchingGus.replace("SessionName=Island", "SessionName=Old\tIsland")),
    );
    const session = report.replacements.find((field) => field.id === "sessionName");
    expect(session?.fileValue).toBe("Old Island");
    expect(session).toBeDefined();
    expect(formatIniImportReplacement(session!)).toBe(
      'Session name in GameUserSettings.ini: "Old Island".\nSession name in YARK: "Island".',
    );
  });

  it("does not show a port with a control character as a different number", () => {
    const report = buildIniImportCompatibilityReport(
      profile,
      payload(matchingGus.replace("Port=7777", "Port=27\u000020")),
    );
    const gamePort = report.replacements.find((field) => field.id === "gamePort");
    expect(gamePort?.fileValue).toBe("27\u000020");
    expect(gamePort).toBeDefined();
    const line = formatIniImportReplacement(gamePort!);
    expect(line).toBe("Game port in GameUserSettings.ini: not a plain number.\nGame port in YARK: 7777.");
    expect(line).not.toContain("27020");
  });

  it("says a blank session name is blank instead of printing an empty value", () => {
    const report = buildIniImportCompatibilityReport(
      profile,
      payload(matchingGus.replace("SessionName=Island", "SessionName=")),
    );
    const session = report.replacements.find((field) => field.id === "sessionName");
    expect(session).toBeDefined();
    expect(formatIniImportReplacement(session!)).toBe(
      'Session name in GameUserSettings.ini: not set.\nSession name in YARK: "Island".',
    );
  });

  it("treats a blank join password as already matching an empty file value", () => {
    const report = buildIniImportCompatibilityReport(
      { ...profile, serverPassword: null },
      payload(matchingGus.replace("ServerPassword=secret-join", "ServerPassword=")),
    );
    expect(report.replacements.map((field) => field.id)).not.toContain("serverPassword");
  });

  it("does not put password text in the operator line", () => {
    const report = buildIniImportCompatibilityReport(
      profile,
      payload(matchingGus.replace("ServerAdminPassword=secret-admin", "ServerAdminPassword=old")),
    );
    const admin = report.replacements.find((field) => field.id === "adminPassword");
    expect(admin?.sensitive).toBe(true);
    expect(admin).toBeDefined();
    const line = formatIniImportReplacement(admin!);
    expect(line).toBe("Admin password differs between GameUserSettings.ini and YARK. Values are hidden.");
    expect(line).not.toContain("secret-admin");
    expect(line).not.toContain("old");
  });
});
