import type {
  ServerProfile,
  ServerProfileInput,
  ServerProfilePatch,
} from "./types";

/** Convert a persisted profile to create/update input (drops generated fields). */
export function serverProfileToInput(server: ServerProfile): ServerProfileInput {
  return {
    name: server.name,
    map: server.map,
    mapModId: server.mapModId ?? null,
    mapSaveFolder: server.mapSaveFolder ?? null,
    installDir: server.installDir,
    sessionName: server.sessionName,
    maxPlayers: server.maxPlayers,
    gamePort: server.gamePort,
    queryPort: server.queryPort,
    rconPort: server.rconPort,
    serverPassword: server.serverPassword,
    adminPassword: server.adminPassword,
    clusterId: server.clusterId,
    clusterDir: server.clusterDir,
    extraArgs: server.extraArgs,
    structuredLaunchArgs: server.structuredLaunchArgs ?? {},
    mods: server.mods,
    disabledMods: server.disabledMods ?? [],
    modMetadataCache: server.modMetadataCache ?? {},
    autoStart: server.autoStart,
  };
}

/**
 * Apply a field-group patch on top of the latest persisted profile.
 * Untouched groups are preserved from `existing` (server-side merge for #209).
 */
export function applyServerProfilePatch(
  existing: ServerProfile,
  patch: ServerProfilePatch,
): ServerProfileInput {
  const base = serverProfileToInput(existing);
  if (patch.group === "launch") {
    return {
      ...base,
      extraArgs: patch.extraArgs,
      structuredLaunchArgs: patch.structuredLaunchArgs,
    };
  }
  return {
    ...base,
    mods: patch.mods,
    disabledMods: patch.disabledMods,
    modMetadataCache: patch.modMetadataCache ?? base.modMetadataCache,
  };
}

export function isServerProfilePatch(value: unknown): value is ServerProfilePatch {
  if (value === null || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  if (body.group === "launch") {
    return (
      Array.isArray(body.extraArgs) &&
      body.extraArgs.every((item) => typeof item === "string") &&
      body.structuredLaunchArgs !== null &&
      typeof body.structuredLaunchArgs === "object" &&
      !Array.isArray(body.structuredLaunchArgs)
    );
  }
  if (body.group === "mods") {
    return (
      Array.isArray(body.mods) &&
      body.mods.every((item) => typeof item === "string") &&
      Array.isArray(body.disabledMods) &&
      body.disabledMods.every((item) => typeof item === "string") &&
      (body.modMetadataCache === undefined ||
        (body.modMetadataCache !== null &&
          typeof body.modMetadataCache === "object" &&
          !Array.isArray(body.modMetadataCache)))
    );
  }
  return false;
}
