import { win32 } from "node:path";
import type { ServerProfile } from "@shared/types";

/** Ruta al ejecutable del servidor dedicado dentro de la instalación. */
export function serverBinaryPath(installDir: string): string {
  return win32.join(
    installDir,
    "ShooterGame",
    "Binaries",
    "Win64",
    "ArkAscendedServer.exe",
  );
}

/**
 * Construye los argumentos de arranque para ArkAscendedServer.exe.
 * El primer argumento es la URL de mapa con parámetros `?`, el resto son flags `-`.
 */
export function buildLaunchArgs(profile: ServerProfile): string[] {
  const queryParts = [
    profile.map,
    "listen",
    `SessionName=${profile.sessionName}`,
    `Port=${profile.gamePort}`,
    `QueryPort=${profile.queryPort}`,
    "RCONEnabled=True",
    `RCONPort=${profile.rconPort}`,
    `ServerAdminPassword=${profile.adminPassword}`,
  ];
  if (profile.serverPassword !== null && profile.serverPassword.length > 0) {
    queryParts.push(`ServerPassword=${profile.serverPassword}`);
  }

  const args: string[] = [queryParts.join("?")];

  if (profile.mods.length > 0) {
    args.push(`-mods=${profile.mods.join(",")}`);
  }
  if (profile.clusterId !== null && profile.clusterDir !== null) {
    args.push(`-clusterid=${profile.clusterId}`);
    args.push(`-ClusterDirOverride=${profile.clusterDir}`);
    args.push("-NoTransferFromFiltering");
  }
  args.push(...profile.extraArgs);
  return args;
}
