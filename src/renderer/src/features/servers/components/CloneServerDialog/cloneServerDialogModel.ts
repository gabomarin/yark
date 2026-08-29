import type { ServerProfile } from "@shared/types";
import { suggestNextPortTriplet } from "@shared/port-suggest";
import { suggestCloneInstallDir } from "@shared/server-install-path";

export interface CloneFormState {
  name: string;
  sessionName: string;
  gamePort: string;
  queryPort: string;
  rconPort: string;
  installDir: string;
  copyInstallFolder: boolean;
}

export function isValidClonePort(value: string): boolean {
  const port = Number(value);
  return Number.isInteger(port) && port >= 1024 && port <= 65535;
}

/** Initial clone form ports/name/path from the source profile and fleet. */
export function cloneDialogFormState(
  source: ServerProfile | null,
  fleet: ReadonlyArray<ServerProfile> = [],
): CloneFormState {
  if (!source) {
    return {
      name: "",
      sessionName: "",
      gamePort: "7777",
      queryPort: "27015",
      rconPort: "27020",
      installDir: "",
      copyInstallFolder: false,
    };
  }

  const name = `${source.name}-copy`;
  // Prefer fleet-aware hunt starting at the source triplet (offset 0 conflicts with
  // source when it is in `fleet`). Empty fleet → start at source+10.
  const suggested = suggestNextPortTriplet({
    profiles: fleet,
    bases:
      fleet.length > 0
        ? {
            gamePort: source.gamePort,
            queryPort: source.queryPort,
            rconPort: source.rconPort,
          }
        : {
            gamePort: source.gamePort + 10,
            queryPort: source.queryPort + 10,
            rconPort: source.rconPort + 10,
          },
    candidateName: name,
  });
  const ports = suggested ?? {
    gamePort: source.gamePort + 10,
    queryPort: source.queryPort + 10,
    rconPort: source.rconPort + 10,
  };
  return {
    name,
    sessionName: `${source.sessionName}-copy`,
    gamePort: String(ports.gamePort),
    queryPort: String(ports.queryPort),
    rconPort: String(ports.rconPort),
    installDir: suggestCloneInstallDir(source.installDir, name),
    copyInstallFolder: false,
  };
}
