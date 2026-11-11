import { getWindowsPathError, normalizeWindowsPath } from "@shared/server/server-install-path";
import { findPortConflicts } from "@shared/server/port-conflicts";
import {
  clusterProcessBusyReason as sharedClusterProcessBusyReason,
  type ServerProcessRuntime,
} from "@shared/server/server-process-idle";
import type { ServerProfile, ServerProfileInput, ServerRuntimeInfo, ServerStatus } from "@shared/types";
import { listDirWithoutIdServers, groupServersByClusterDir } from "./clusterModel";

/** Absolute Windows path (drive letter or UNC) — mirrors backend validation. */
const WINDOWS_ABS_PATH = /^(?:[a-zA-Z]:[\\/]|\\\\)/;

/** Cluster IDs already used on profiles (case-insensitive uniqueness). */
export function listKnownClusterIds(servers: ServerProfile[]): string[] {
  return [
    ...new Set(
      servers
        .map((server) => server.clusterId)
        .filter((id): id is string => id !== null && id.trim().length > 0)
        .map((id) => id.trim()),
    ),
  ];
}

/** Generated Cluster IDs keep this prefix so the operator can recognize them. */
const SUGGESTED_CLUSTER_ID_PREFIX = "yark-cluster-";

/**
 * Hex digits after the prefix (32 bits). Short enough to read in the form and
 * on `-clusterid=`. A shared sequence such as `yark-cluster-1` shows other
 * players' servers in the in-game transfer list.
 */
const SUGGESTED_CLUSTER_ID_SUFFIX_HEX_LENGTH = 8;

const SUGGESTED_CLUSTER_ID_ATTEMPTS = 8;

/** 8 lowercase hex digits from a UUID. */
function randomClusterIdSuffix(): string {
  return globalThis.crypto.randomUUID().replaceAll("-", "").slice(0, SUGGESTED_CLUSTER_ID_SUFFIX_HEX_LENGTH);
}

/** `yark-cluster-` plus exactly 8 hex digits, or null when the suffix is shorter. */
function toSuggestedClusterId(rawSuffix: string): string | null {
  const hex = rawSuffix
    .trim()
    .toLowerCase()
    .replace(/[^0-9a-f]/g, "");
  if (hex.length < SUGGESTED_CLUSTER_ID_SUFFIX_HEX_LENGTH) return null;
  return `${SUGGESTED_CLUSTER_ID_PREFIX}${hex.slice(0, SUGGESTED_CLUSTER_ID_SUFFIX_HEX_LENGTH)}`;
}

function firstFreeSuggestedClusterId(taken: Set<string>, source: () => string, attempts: number): string | null {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const id = toSuggestedClusterId(source());
    if (id !== null && !taken.has(id)) return id;
  }
  return null;
}

/**
 * 8 hex digits that are not in `taken`. `taken.size + 1` distinct ids cannot all be taken.
 */
function unusedSuggestedClusterId(taken: Set<string>): string {
  const parsed = Number.parseInt(randomClusterIdSuffix(), 16);
  const base = Number.isFinite(parsed) ? parsed >>> 0 : 0;
  for (let step = 0; step <= taken.size; step += 1) {
    const suffix = ((base + step) >>> 0).toString(16).padStart(SUGGESTED_CLUSTER_ID_SUFFIX_HEX_LENGTH, "0");
    const id = `${SUGGESTED_CLUSTER_ID_PREFIX}${suffix}`;
    if (!taken.has(id)) return id;
  }
  throw new Error("No free cluster id suffix");
}

/**
 * Default Cluster ID (`yark-cluster-` plus 8 hex digits, for example `yark-cluster-7f3a9c2e`).
 * Pass current IDs so Generate skips a suffix this PC already uses.
 * `nextSuffix` is for tests; the app draws the suffix from `crypto.randomUUID()`.
 * A taken or empty suffix is skipped. The result stays 8 hex digits.
 */
export function suggestClusterId(
  taken: Iterable<string> = [],
  nextSuffix: () => string = randomClusterIdSuffix,
): string {
  const takenSet = new Set([...taken].map((id) => id.trim().toLowerCase()).filter((id) => id.length > 0));
  return (
    firstFreeSuggestedClusterId(takenSet, nextSuffix, SUGGESTED_CLUSTER_ID_ATTEMPTS) ??
    firstFreeSuggestedClusterId(takenSet, randomClusterIdSuffix, SUGGESTED_CLUSTER_ID_ATTEMPTS) ??
    unusedSuggestedClusterId(takenSet)
  );
}

export type CreateClusterStep = 1 | 2 | 3;

export interface CreateClusterCandidate {
  server: ServerProfile;
  status: ServerStatus;
  eligible: boolean;
  reason: string | null;
}

export function resolveServerRuntime(
  statuses: Map<string, Pick<ServerRuntimeInfo, "status" | "processLive">>,
  serverId: string,
): ServerProcessRuntime {
  const info = statuses.get(serverId);
  if (info === undefined) {
    return { status: "stopped", processLive: false };
  }
  return {
    status: info.status,
    processLive: info.processLive ?? false,
  };
}

/**
 * Cluster membership / template apply is safe when the ASA child is not live.
 * Idle `error` (process exited) is allowed (#276).
 */
export function clusterProcessBusyReason(runtime: ServerProcessRuntime): string | null {
  return sharedClusterProcessBusyReason(runtime);
}

export function ineligibilityReason(server: ServerProfile, runtime: ServerProcessRuntime): string | null {
  if (server.clusterId !== null) {
    return `Already in cluster “${server.clusterId}”`;
  }
  return clusterProcessBusyReason(runtime);
}

export function listCreateClusterCandidates(
  servers: ServerProfile[],
  statuses: Map<string, Pick<ServerRuntimeInfo, "status" | "processLive">>,
): CreateClusterCandidate[] {
  return [...servers]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((server) => {
      const runtime = resolveServerRuntime(statuses, server.id);
      const reason = ineligibilityReason(server, runtime);
      return {
        server,
        status: runtime.status,
        eligible: reason === null,
        reason,
      };
    });
}

export function toggleSelectedServerId(selectedIds: string[], serverId: string): string[] {
  return selectedIds.includes(serverId) ? selectedIds.filter((id) => id !== serverId) : [...selectedIds, serverId];
}

/** Drop ids that are no longer eligible (e.g. server started while the modal is open). */
export function pruneSelectedServerIds(selectedIds: string[], candidates: CreateClusterCandidate[]): string[] {
  const eligibleIds = new Set(
    candidates.filter((candidate) => candidate.eligible).map((candidate) => candidate.server.id),
  );
  return selectedIds.filter((id) => eligibleIds.has(id));
}

export function resolveSelectedCandidates(
  candidates: CreateClusterCandidate[],
  selectedIds: string[],
): CreateClusterCandidate[] {
  const selected = new Set(selectedIds);
  return candidates.filter((candidate) => selected.has(candidate.server.id) && candidate.eligible);
}

/** Prefill when every selected member already shares one cluster directory. */
export function sharedPrefillClusterDir(servers: ServerProfile[]): string | null {
  const dirs = [
    ...new Set(
      servers.map((server) => server.clusterDir).filter((dir): dir is string => dir !== null && dir.length > 0),
    ),
  ];
  return dirs.length === 1 ? (dirs[0] ?? null) : null;
}

export function getSelectedMembersPortError(servers: ServerProfile[]): string | null {
  if (servers.length < 2) return null;
  const conflicts = findPortConflicts(servers);
  if (conflicts.length === 0) return null;
  const first = conflicts[0]!;
  return `${first.serverA} and ${first.serverB} both use ${first.kind} port ${first.port}. Change ports before creating the cluster.`;
}

export function getClusterIdFormError(clusterId: string, clusterDir: string, servers: ServerProfile[]): string | null {
  const value = clusterId.trim();
  if (value.length === 0) {
    return "Cluster ID is required.";
  }

  const members = servers.filter(
    (server) => server.clusterId !== null && server.clusterId.toLowerCase() === value.toLowerCase(),
  );
  if (members.length === 0) {
    return null;
  }

  const existingDirs = [
    ...new Set(
      members
        .map((member) => member.clusterDir)
        .filter((dir): dir is string => dir !== null && dir.length > 0)
        .map((dir) => normalizeWindowsPath(dir)),
    ),
  ];
  const proposed = normalizeWindowsPath(clusterDir);
  const mismatch = existingDirs.find((dir) => dir.toLowerCase() !== proposed.toLowerCase());
  if (mismatch !== undefined) {
    return `ID already used with a different directory (${mismatch}).`;
  }
  return "A cluster with this ID already exists (case-insensitive).";
}

export function getClusterDirFormError(clusterDir: string): string | null {
  const trimmed = clusterDir.trim();
  if (trimmed.length === 0) {
    return "Cluster directory is required.";
  }
  const normalized = normalizeWindowsPath(trimmed);
  if (!WINDOWS_ABS_PATH.test(normalized)) {
    return "Use a Windows absolute path (e.g. D:\\ASA\\Clusters\\Ember).";
  }
  return getWindowsPathError(normalized, "Cluster directory");
}

export function listIncompleteClusterGroups(
  servers: ServerProfile[],
): Array<{ dir: string; members: ServerProfile[] }> {
  return groupServersByClusterDir(listDirWithoutIdServers(servers));
}

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
    useAsaApi: server.useAsaApi === true,
    useAsaApiLoader: server.useAsaApiLoader === true,
  };
}

export function buildCreateClusterInput(
  server: ServerProfile,
  clusterId: string,
  clusterDir: string,
): ServerProfileInput {
  return {
    ...serverProfileToInput(server),
    clusterId: clusterId.trim(),
    clusterDir: normalizeWindowsPath(clusterDir),
  };
}
