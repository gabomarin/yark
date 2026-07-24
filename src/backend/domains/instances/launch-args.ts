import { join } from "node:path";
import type { ServerProfile } from "@shared/types";

/** Path to the dedicated server executable inside the install. */
export function serverBinaryPath(installDir: string): string {
  return join(
    installDir,
    "ShooterGame",
    "Binaries",
    "Win64",
    "ArkAscendedServer.exe",
  );
}

/**
 * Builds launch arguments for ArkAscendedServer.exe.
 * The first argument is the map URL with `?` parameters; the rest are `-` flags.
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
