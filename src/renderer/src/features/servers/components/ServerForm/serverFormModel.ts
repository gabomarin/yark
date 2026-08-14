import {
  resolveServerInstallDir,
} from "@shared/server-install-path";
import { KNOWN_MAPS, type ServerProfile, type ServerProfileInput } from "@shared/types";

export interface ServerFormState {
  name: string;
  map: string;
  mapModId: string | null;
  mapSaveFolder: string | null;
  installDir: string;
  sessionName: string;
  gamePort: string;
  queryPort: string;
  rconPort: string;
  serverPassword: string;
  adminPassword: string;
  clusterId: string;
  clusterDir: string;
  autoStart: boolean;
}

export function toServerFormState(
  profile: ServerProfile | null,
  defaultBaseFolder?: string | null,
  preferredCluster?: { clusterId: string; clusterDir: string } | null,
): ServerFormState {
  if (profile === null) {
    const base = defaultBaseFolder?.trim() ?? "";
    return {
      name: "",
      map: KNOWN_MAPS[0],
      mapModId: null,
      mapSaveFolder: null,
      installDir: base,
      sessionName: "",
      gamePort: "7777",
      queryPort: "27015",
      rconPort: "27020",
      serverPassword: "",
      adminPassword: "",
      clusterId: preferredCluster?.clusterId ?? "",
      clusterDir: preferredCluster?.clusterDir ?? "",
      autoStart: false,
    };
  }

  return {
    name: profile.name,
    map: profile.map,
    mapModId: profile.mapModId ?? null,
    mapSaveFolder: profile.mapSaveFolder ?? null,
    installDir: profile.installDir,
    sessionName: profile.sessionName,
    gamePort: String(profile.gamePort),
    queryPort: String(profile.queryPort),
    rconPort: String(profile.rconPort),
    serverPassword: profile.serverPassword ?? "",
    adminPassword: profile.adminPassword,
    clusterId: profile.clusterId ?? "",
    clusterDir: profile.clusterDir ?? "",
    autoStart: profile.autoStart,
  };
}

export function serverFormToInput(
  state: ServerFormState,
  isCreate: boolean,
  initial: ServerProfile | null,
): ServerProfileInput {
  const name = state.name.trim();
  const baseOrInstall = state.installDir.trim();
  return {
    name,
    map: state.map.trim(),
    mapModId: state.mapModId,
    mapSaveFolder: state.mapSaveFolder,
    installDir: isCreate
      ? resolveServerInstallDir(baseOrInstall, name)
      : baseOrInstall,
    sessionName: state.sessionName.trim(),
    gamePort: Number(state.gamePort),
    queryPort: Number(state.queryPort),
    rconPort: Number(state.rconPort),
    serverPassword:
      state.serverPassword.trim().length > 0 ? state.serverPassword.trim() : null,
    adminPassword: state.adminPassword,
    clusterId: state.clusterId.trim().length > 0 ? state.clusterId.trim() : null,
    clusterDir: state.clusterDir.trim().length > 0 ? state.clusterDir.trim() : null,
    extraArgs: initial?.extraArgs ?? [],
    structuredLaunchArgs: initial?.structuredLaunchArgs ?? {},
    mods: initial?.mods ?? [],
    disabledMods: initial?.disabledMods ?? [],
    modMetadataCache: initial?.modMetadataCache ?? {},
    autoStart: state.autoStart,
  };
}
