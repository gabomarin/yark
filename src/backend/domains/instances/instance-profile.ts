import { PORT_MAX, PORT_MIN, type ServerProfile, type SessionPortSet } from "@shared/types";
import type { InstallationServersMode } from "@shared/types";
import { installDirKey } from "./install-dir-safety";
import { sameServerIds } from "./instance-lifecycle";
import type { ServerInstallationInfo } from "@shared/types";

export function applySessionPortsToProfile(
  profile: ServerProfile,
  session: SessionPortSet,
): ServerProfile {
  validateSessionPorts(session);
  return {
    ...profile,
    gamePort: session.gamePort,
    queryPort: session.queryPort,
    rconPort: session.rconPort,
  };
}

export function validateSessionPorts(ports: SessionPortSet): void {
  const entries: Array<[string, number]> = [
    ["gamePort", ports.gamePort],
    ["queryPort", ports.queryPort],
    ["rconPort", ports.rconPort],
  ];
  for (const [field, value] of entries) {
    if (
      !Number.isInteger(value)
      || value < PORT_MIN
      || value > PORT_MAX
    ) {
      throw new Error(
        `${field} must be an integer between ${PORT_MIN} and ${PORT_MAX}`,
      );
    }
  }
  if (
    ports.gamePort === ports.queryPort
    || ports.gamePort === ports.rconPort
    || ports.queryPort === ports.rconPort
  ) {
    throw new Error("Game, query, and RCON session ports must be distinct");
  }
}

export function buildFleetInspectKey(
  profiles: ReadonlyArray<Pick<ServerProfile, "id" | "installDir">>,
  bypassCache: boolean,
): string {
  const ids = profiles
    .map((profile) => `${profile.id}\0${installDirKey(profile.installDir)}`)
    .sort()
    .join("\n");
  return `${bypassCache ? "1" : "0"}\n${ids}`;
}

export function shouldInspectFleetInstallations(input: {
  forceOfficialCheck: boolean;
  serversMode: InstallationServersMode;
  officialChanged: boolean;
  serverSetChanged: boolean;
}): boolean {
  return (
    input.forceOfficialCheck
    || input.serversMode === true
    || (input.serversMode === "when-official-changed"
      && (input.officialChanged || input.serverSetChanged))
  );
}

export function fleetServerSetChanged(
  profiles: ReadonlyArray<{ id: string }>,
  cached: ReadonlyArray<ServerInstallationInfo>,
): boolean {
  return !sameServerIds(profiles, cached);
}
