import { describe, expect, it } from "vitest";
import { importChoiceIdentity, planAdoptExternalIni } from "@shared/ini/ini-import-adopt";
import { buildIniImportCompatibilityReport } from "@shared/ini/ini-import-compatibility";
import type { ServerProfile } from "@shared/types";

const server: ServerProfile = {
  id: "srv-a",
  name: "Island",
  map: "TheIsland_WP",
  installDir: "C:/ARK/Island",
  enabled: true,
  autoStart: false,
  useAsaApi: false,
  useAsaApiLoader: false,
  sessionName: "Island",
  maxPlayers: 70,
  gamePort: 7777,
  queryPort: 27015,
  rconPort: 27020,
  serverPassword: null,
  adminPassword: "secret-admin",
  clusterId: null,
  clusterDir: null,
  extraArgs: [],
  mods: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const matchingGus = `[SessionSettings]
SessionName=Island
Port=7777
QueryPort=27015

[ServerSettings]
RCONEnabled=True
RCONPort=27020
ServerAdminPassword=secret-admin
ServerPassword=
`;

function reportFor(gameUserSettings: string) {
  return buildIniImportCompatibilityReport(server, { gameUserSettings, game: "" });
}

describe("planAdoptExternalIni", () => {
  it("copies a session name from GameUserSettings.ini into the profile", () => {
    const plan = planAdoptExternalIni(
      server,
      [server],
      reportFor(matchingGus.replace("SessionName=Island", "SessionName=Old Island")),
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.input.sessionName).toBe("Old Island");
    expect(plan.input.gamePort).toBe(7777);
    expect(plan.input.adminPassword).toBe("secret-admin");
  });

  it("refuses a port another server already uses", () => {
    const other: ServerProfile = {
      ...server,
      id: "srv-b",
      name: "Other",
      gamePort: 7778,
      queryPort: 27016,
      rconPort: 27021,
    };
    const plan = planAdoptExternalIni(
      server,
      [server, other],
      reportFor(matchingGus.replace("Port=7777", "Port=7778")),
    );
    expect(plan).toEqual({
      ok: false,
      reason: "Port 7778 is already used by Other, so YARK can't take that game port.",
    });
  });

  it("refuses an admin password shorter than 4 characters and does not return the secret", () => {
    const plan = planAdoptExternalIni(
      server,
      [server],
      reportFor(matchingGus.replace("ServerAdminPassword=secret-admin", "ServerAdminPassword=ab")),
    );
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.reason).toBe("The admin password in GameUserSettings.ini needs at least 4 characters.");
    expect(plan.reason).not.toContain("secret-admin");
    expect(plan.reason).not.toContain("ab");
  });

  it("names the port this server would take when the other server uses that number for a different role", () => {
    const other: ServerProfile = {
      ...server,
      id: "srv-b",
      name: "Other",
      gamePort: 7779,
      queryPort: 7778,
      rconPort: 27021,
    };
    const plan = planAdoptExternalIni(
      server,
      [server, other],
      reportFor(matchingGus.replace("Port=7777", "Port=7778")),
    );
    expect(plan).toEqual({
      ok: false,
      reason: "Port 7778 is already used by Other, so YARK can't take that game port.",
    });
  });

  it("refuses a missing admin password and does not clear the one in YARK", () => {
    const plan = planAdoptExternalIni(
      server,
      [server],
      reportFor(matchingGus.replace("ServerAdminPassword=secret-admin\n", "")),
    );
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.reason).toBe(
      "GameUserSettings.ini has no admin password. Choose Keep YARK values to keep the one in YARK.",
    );
    expect(plan.reason).not.toContain("secret-admin");
  });

  it("clears a join password the file omits while copying the session name", () => {
    const withJoin: ServerProfile = { ...server, serverPassword: "secret-join" };
    const gameUserSettings = matchingGus
      .replace("SessionName=Island", "SessionName=Old Island")
      .replace("ServerPassword=\n", "");
    const plan = planAdoptExternalIni(
      withJoin,
      [withJoin],
      buildIniImportCompatibilityReport(withJoin, { gameUserSettings, game: "" }),
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.input.sessionName).toBe("Old Island");
    expect(plan.input.serverPassword).toBeNull();
    expect(plan.input.adminPassword).toBe("secret-admin");
  });

  it("keeps passwords out of the choice remembered by the Server tab", () => {
    const withSecrets: ServerProfile = { ...server, serverPassword: "secret-join" };
    const key = importChoiceIdentity("srv-a", withSecrets);
    expect(key).toBe("srv-a\u001fIsland\u001f7777\u001f27015\u001f27020");
    expect(key).not.toContain("secret-admin");
    expect(key).not.toContain("secret-join");
  });

  it("does not treat two other servers with this server's name as a clash on this server", () => {
    const alpha: ServerProfile = {
      ...server,
      id: "srv-b",
      name: "Island",
      gamePort: 7790,
      queryPort: 27016,
      rconPort: 27021,
    };
    const beta: ServerProfile = {
      ...server,
      id: "srv-c",
      name: "Island",
      gamePort: 7790,
      queryPort: 27017,
      rconPort: 27022,
    };
    const plan = planAdoptExternalIni(
      server,
      [server, alpha, beta],
      reportFor(matchingGus.replace("SessionName=Island", "SessionName=Old Island")),
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.input.sessionName).toBe("Old Island");
  });

  it("blocks a same-named server by id when that server already uses the port", () => {
    const other: ServerProfile = {
      ...server,
      id: "srv-b",
      name: "Island",
      gamePort: 7779,
      queryPort: 7778,
      rconPort: 27021,
    };
    const plan = planAdoptExternalIni(
      server,
      [server, other],
      reportFor(matchingGus.replace("Port=7777", "Port=7778")),
    );
    expect(plan).toEqual({
      ok: false,
      reason: "Port 7778 is already used by Island, so YARK can't take that game port.",
    });
  });

  it("ignores a port clash between two other servers", () => {
    const alpha: ServerProfile = {
      ...server,
      id: "srv-b",
      name: "Alpha",
      gamePort: 7790,
      queryPort: 27016,
      rconPort: 27021,
    };
    const beta: ServerProfile = {
      ...server,
      id: "srv-c",
      name: "Beta",
      gamePort: 7790,
      queryPort: 27017,
      rconPort: 27022,
    };
    const plan = planAdoptExternalIni(
      server,
      [server, alpha, beta],
      reportFor(matchingGus.replace("SessionName=Island", "SessionName=Old Island")),
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.input.sessionName).toBe("Old Island");
    expect(plan.input.gamePort).toBe(7777);
  });

  it("refuses a port that ends with a tab instead of saving the digits", () => {
    const plan = planAdoptExternalIni(server, [server], reportFor(matchingGus.replace("Port=7777", "Port=7777\t")));
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.reason).toBe("Game port in GameUserSettings.ini isn't a real port.");
  });

  it("refuses a port that hides a control character instead of turning it into another port", () => {
    const plan = planAdoptExternalIni(server, [server], reportFor(matchingGus.replace("Port=7777", "Port=27\u000020")));
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.reason).toBe("Game port in GameUserSettings.ini isn't a real port.");
    expect(plan.reason).not.toContain("27020");
    expect(plan.reason).not.toContain("270");
  });

  it("does not copy RCON off into the profile", () => {
    const plan = planAdoptExternalIni(
      server,
      [server],
      reportFor(matchingGus.replace("RCONEnabled=True", "RCONEnabled=False")),
    );
    expect(plan).toEqual({
      ok: false,
      reason: "YARK keeps RCON on. Choose Keep YARK values to save that.",
    });
  });
});
