/**
 * Decide whether the operator can copy externally edited identity values
 * from GameUserSettings.ini into the YARK profile (#682).
 */

import { findPortConflicts } from "../server/port-conflicts";
import { PORT_MAX, PORT_MIN, type PortConflict, type ServerProfile, type ServerProfileInput } from "../types";
import type {
  IniImportCompatibilityReport,
  IniImportFieldId,
  IniImportIdentityField,
} from "./ini-import-compatibility";

type FleetServer = Pick<ServerProfile, "id" | "name" | "gamePort" | "queryPort" | "rconPort">;

export type IniImportAdoptResult = { ok: true; input: ServerProfileInput } | { ok: false; reason: string };

export function serverToProfileInput(server: ServerProfile): ServerProfileInput {
  const { id: _id, enabled: _enabled, createdAt: _createdAt, updatedAt: _updatedAt, ...input } = server;
  return input;
}

/**
 * Identity the Server tab just chose. Survives the form remount that follows a profile refresh.
 * Session name and ports only. Passwords stay in the profile update, not in tab state.
 */
export function importChoiceIdentity(
  serverId: string,
  profile: Pick<ServerProfileInput, "sessionName" | "gamePort" | "queryPort" | "rconPort">,
): string {
  return [serverId, profile.sessionName, profile.gamePort, profile.queryPort, profile.rconPort].join("\u001f");
}

function replacement(report: IniImportCompatibilityReport, id: IniImportFieldId): IniImportIdentityField | undefined {
  return report.replacements.find((field) => field.id === id);
}

function parsePort(raw: string | null, label: string, problems: string[]): number | null {
  if (raw === null || !/^\d+$/.test(raw.trim())) {
    problems.push(`${label} in GameUserSettings.ini isn't a real port.`);
    return null;
  }
  const port = Number(raw.trim());
  if (port < PORT_MIN || port > PORT_MAX) {
    problems.push(`${label} in GameUserSettings.ini has to be between ${PORT_MIN} and ${PORT_MAX}.`);
    return null;
  }
  return port;
}

function takenPortKind(
  port: number,
  candidate: { gamePort: number; queryPort: number; rconPort: number },
): PortConflict["kind"] {
  if (port === candidate.gamePort) return "game";
  if (port === candidate.queryPort) return "query";
  return "rcon";
}

function conflictsForCandidate(
  serverName: string,
  conflicts: PortConflict[],
  candidate: { gamePort: number; queryPort: number; rconPort: number },
): PortConflict[] {
  return conflicts.filter((conflict) => {
    const involvesServer = conflict.serverA === serverName || conflict.serverB === serverName;
    const portIsCandidate =
      conflict.port === candidate.gamePort ||
      conflict.port === candidate.queryPort ||
      conflict.port === candidate.rconPort;
    return involvesServer && portIsCandidate;
  });
}

function conflictReason(
  serverName: string,
  conflicts: PortConflict[],
  candidate: { gamePort: number; queryPort: number; rconPort: number },
): string {
  return conflictsForCandidate(serverName, conflicts, candidate)
    .map((conflict) => {
      const other = conflict.serverA === serverName ? conflict.serverB : conflict.serverA;
      const kind = takenPortKind(conflict.port, candidate);
      return `Port ${conflict.port} is already used by ${other}, so YARK can't take that ${kind} port.`;
    })
    .join(" ");
}

/**
 * Build a profile update from the INI. Refuses when a port clashes with another
 * server, the three ports are not distinct, or a password or name cannot be stored.
 * A missing or blank admin password is refused. YARK does not clear it.
 * A missing or blank join password clears the join password.
 * RCON on/off is not a profile field. YARK keeps RCON on.
 */
export function planAdoptExternalIni(
  server: ServerProfile,
  fleet: ReadonlyArray<FleetServer>,
  report: IniImportCompatibilityReport,
): IniImportAdoptResult {
  const adoptable = report.replacements.filter((field) => field.id !== "rconEnabled");
  if (adoptable.length === 0) {
    return { ok: false, reason: "YARK keeps RCON on. Choose Keep YARK values to save that." };
  }

  const problems: string[] = [];
  const session = replacement(report, "sessionName");
  const sessionName = session === undefined ? server.sessionName : (session.fileValue ?? "").trim();
  if (session !== undefined && sessionName.length === 0) {
    problems.push("The name in GameUserSettings.ini is blank.");
  }
  if (sessionName.length > 96) {
    problems.push("That name is too long for YARK.");
  }

  const gamePort = parsePort(
    replacement(report, "gamePort")?.fileValue ?? String(server.gamePort),
    "Game port",
    problems,
  );
  const queryPort = parsePort(
    replacement(report, "queryPort")?.fileValue ?? String(server.queryPort),
    "Query port",
    problems,
  );
  const rconPort = parsePort(
    replacement(report, "rconPort")?.fileValue ?? String(server.rconPort),
    "RCON port",
    problems,
  );

  const admin = replacement(report, "adminPassword");
  const adminPassword = admin === undefined ? server.adminPassword : admin.fileValue;
  if (admin !== undefined) {
    if (admin.fileValue === null || admin.fileValue === "") {
      problems.push("GameUserSettings.ini has no admin password. Choose Keep YARK values to keep the one in YARK.");
    } else if (admin.fileValue.length < 4) {
      problems.push("The admin password in GameUserSettings.ini needs at least 4 characters.");
    }
  }

  const join = replacement(report, "serverPassword");
  const serverPassword =
    join === undefined
      ? server.serverPassword
      : join.fileValue === null || join.fileValue === ""
        ? null
        : join.fileValue;

  if (
    gamePort !== null &&
    queryPort !== null &&
    rconPort !== null &&
    new Set([gamePort, queryPort, rconPort]).size !== 3
  ) {
    problems.push("The game, query, and RCON ports in GameUserSettings.ini have to be different.");
  }

  if (
    problems.length > 0 ||
    gamePort === null ||
    queryPort === null ||
    rconPort === null ||
    adminPassword === null ||
    adminPassword.length < 4
  ) {
    return { ok: false, reason: problems.join(" ") };
  }

  const candidate = { gamePort, queryPort, rconPort };
  const others = fleet.filter((profile) => profile.id !== server.id);
  const conflicts = findPortConflicts(others, {
    id: server.id,
    name: server.name,
    ...candidate,
  });
  const reason = conflictReason(server.name, conflicts, candidate);
  if (reason.length > 0) {
    return { ok: false, reason };
  }

  return {
    ok: true,
    input: {
      ...serverToProfileInput(server),
      sessionName,
      gamePort,
      queryPort,
      rconPort,
      adminPassword,
      serverPassword,
    },
  };
}
