import type { ImportInstallProbe, ImportInstallSuggestions, ModMetadata, ServerProfileInput } from "@shared/types";

export type ImportInstallStep = 1 | 2 | 3;

export type ImportFormState = {
  name: string;
  sessionName: string;
  map: string;
  mapModId: string | null;
  mapSaveFolder: string | null;
  gamePort: string;
  queryPort: string;
  rconPort: string;
  adminPassword: string;
  serverPassword: string;
  clusterId: string;
  clusterDir: string;
  autoStart: boolean;
};

export function suggestionsToForm(suggestions: ImportInstallSuggestions): ImportFormState {
  return {
    name: suggestions.name,
    sessionName: suggestions.sessionName,
    map: suggestions.map,
    mapModId: suggestions.mapModId,
    mapSaveFolder: null,
    gamePort: String(suggestions.gamePort),
    queryPort: String(suggestions.queryPort),
    rconPort: String(suggestions.rconPort),
    adminPassword: suggestions.adminPassword,
    serverPassword: suggestions.serverPassword ?? "",
    clusterId: "",
    clusterDir: "",
    autoStart: false,
  };
}

export function applyPreferredCluster(
  form: ImportFormState,
  preferred: { clusterId: string; clusterDir: string } | undefined,
): ImportFormState {
  if (preferred === undefined) {
    return form;
  }
  return {
    ...form,
    clusterId: preferred.clusterId,
    clusterDir: preferred.clusterDir,
  };
}

export function emptyImportForm(): ImportFormState {
  return {
    name: "",
    sessionName: "",
    map: "TheIsland_WP",
    mapModId: null,
    mapSaveFolder: null,
    gamePort: "7777",
    queryPort: "27015",
    rconPort: "27020",
    adminPassword: "",
    serverPassword: "",
    clusterId: "",
    clusterDir: "",
    autoStart: false,
  };
}

function parsePort(raw: string): number | null {
  if (!/^\d+$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  return Number.isInteger(n) && n >= 1024 && n <= 65535 ? n : null;
}

export function formToProfileInput(
  form: ImportFormState,
  installDir: string,
  mods: string[],
  modMetadataCache: Record<string, ModMetadata> = {},
): ServerProfileInput | { error: string } {
  const gamePort = parsePort(form.gamePort);
  const queryPort = parsePort(form.queryPort);
  const rconPort = parsePort(form.rconPort);
  if (gamePort === null || queryPort === null || rconPort === null) {
    return { error: "Ports must be integers between 1024 and 65535" };
  }
  if (form.name.trim().length === 0) {
    return { error: "Name required" };
  }
  if (form.sessionName.trim().length === 0) {
    return { error: "Session name required" };
  }
  if (form.adminPassword.trim().length < 4) {
    return { error: "Admin password must be at least 4 characters" };
  }
  const map = form.map.trim();
  if (map.length === 0) {
    return { error: "Map required" };
  }
  const clusterId = form.clusterId.trim();
  const clusterDir = form.clusterDir.trim();
  const cache: Record<string, ModMetadata> = {};
  for (const id of mods) {
    const row = modMetadataCache[id];
    if (row !== undefined) {
      cache[id] = row;
    }
  }
  return {
    name: form.name.trim(),
    sessionName: form.sessionName.trim(),
    map,
    mapModId: form.mapModId,
    mapSaveFolder: form.mapSaveFolder,
    installDir,
    gamePort,
    queryPort,
    rconPort,
    adminPassword: form.adminPassword,
    serverPassword: form.serverPassword.trim().length > 0 ? form.serverPassword : null,
    clusterId: clusterId.length > 0 ? clusterId : null,
    clusterDir: clusterDir.length > 0 ? clusterDir : null,
    extraArgs: [],
    structuredLaunchArgs: {},
    mods: [...mods],
    disabledMods: [...mods],
    modMetadataCache: cache,
    autoStart: form.autoStart,
  };
}

export function healthTone(
  probe: Pick<ImportInstallProbe, "canContinue">,
): "ready" | "blocked" {
  return probe.canContinue ? "ready" : "blocked";
}

/**
 * Whether the Import wizard may leave step 1 (#254 / #283).
 * Ready probes unlock via `canContinue`; incomplete requires explicit opt-in.
 */
export function canImportInstallProceed(
  probe: ImportInstallProbe,
  allowIncompleteInstall: boolean,
): boolean {
  if (probe.canContinue) return true;
  if (!allowIncompleteInstall) return false;
  if (probe.alreadyManagedBy !== null) return false;
  if (probe.nestedSubfolder) return false;
  return probe.installation.health === "incomplete";
}

/** Operator-facing badge text for import (never show raw `suspicious`). */
export function importHealthBadgeLabel(
  probe: Pick<
    ImportInstallProbe,
    "nestedSubfolder" | "installation" | "alreadyManagedBy"
  >,
): string {
  if (probe.alreadyManagedBy !== null && probe.alreadyManagedBy.length > 0) {
    return "Already managed";
  }
  if (probe.nestedSubfolder) {
    return "Nested folder";
  }
  switch (probe.installation.health) {
    case "ready":
      return "Ready";
    case "empty":
      return "Empty folder";
    case "incomplete":
      return "Incomplete";
    case "missing":
      return "Missing path";
    case "inaccessible":
      return "Inaccessible";
    case "suspicious":
      return "Not an ASA install";
    case "unknown":
      return "Check failed";
  }
}
