import { isInstallationReady } from "@shared/installation-health";
import { getServerUpdateState } from "@shared/server-update-status";
import type { ProcessMetricsUpdatedPush } from "@shared/ipc";
import type {
  ServerInstallationInfo,
  ServerProfile,
  ServerRuntimeInfo,
} from "@shared/types";
import type { PlayerListState } from "@features/server-workspace/components/RconPanel/PlayerListSection";
import {
  hasLiveProcessFleet,
  sumFleetCpuPercent,
  sumFleetWorkingSetBytes,
} from "@features/servers/model/serverCardProcessMeta";
import { resolveServerSurvivorCount } from "@features/servers/model/serverCardSurvivorMeta";
import { collectAttentionIssues, type AttentionIssue } from "./attentionIssues";

/** Clickable Overview fleet strip filters (#314). Toggle again → `all`. */
export type OverviewFleetFilter =
  | "all"
  | "running"
  | "stopped"
  | "attention"
  | "updates";

export interface OverviewFleetStats {
  enabledCount: number;
  runningCount: number;
  /** Sum of known online survivors on running servers (#301). Not a strip filter. */
  survivorsOnlineTotal: number | null;
  stoppedCount: number;
  attentionCount: number;
  updatesCount: number;
  attentionServerIds: ReadonlySet<string>;
  updateServerIds: ReadonlySet<string>;
}

export interface OverviewFleetComputed {
  stats: OverviewFleetStats;
  attentionIssues: AttentionIssue[];
}

function runtimeStatus(
  statuses: Map<string, ServerRuntimeInfo>,
  serverId: string,
): ServerRuntimeInfo["status"] {
  return statuses.get(serverId)?.status ?? "stopped";
}

/**
 * Sum known online survivors on running enabled servers (#301).
 * Returns `null` until at least one running server has a real RCON sample
 * (never invents a fleet `0`).
 */
export function sumSurvivorsOnlineTotal(input: {
  enabledServers: ReadonlyArray<ServerProfile>;
  statuses: Map<string, ServerRuntimeInfo>;
  playerListsByServer: Map<string, PlayerListState>;
}): number | null {
  let total = 0;
  let hasKnownSample = false;
  for (const server of input.enabledServers) {
    const status = runtimeStatus(input.statuses, server.id);
    if (status !== "running") {
      continue;
    }
    const survivorCount = resolveServerSurvivorCount({
      status,
      survivorList: input.playerListsByServer.get(server.id) ?? null,
    });
    if (survivorCount != null) {
      total += survivorCount;
      hasKnownSample = true;
    }
  }
  return hasKnownSample ? total : null;
}

/** Header process readouts for starting/running enabled servers (#302). */
export interface OverviewProcessFleetReadouts {
  showProcessFleetMetrics: boolean;
  fleetRamBytes: number | null;
  fleetCpuPercent: number | null;
}

/**
 * Fleet RAM / CPU header values — single Overview entry point over
 * `serverCardProcessMeta` sum helpers (#302).
 */
export function computeOverviewProcessFleetReadouts(input: {
  enabledServers: ReadonlyArray<ServerProfile>;
  statuses: Map<string, ServerRuntimeInfo>;
  metricsByServer: Map<string, ProcessMetricsUpdatedPush>;
}): OverviewProcessFleetReadouts {
  return {
    showProcessFleetMetrics: hasLiveProcessFleet({
      enabledServers: input.enabledServers,
      statuses: input.statuses,
    }),
    fleetRamBytes: sumFleetWorkingSetBytes({
      enabledServers: input.enabledServers,
      statuses: input.statuses,
      metricsByServer: input.metricsByServer,
    }),
    fleetCpuPercent: sumFleetCpuPercent({
      enabledServers: input.enabledServers,
      statuses: input.statuses,
      metricsByServer: input.metricsByServer,
    }),
  };
}

/** Counts from the enabled fleet only — not search-narrowed. */
export function computeOverviewFleetStats(input: {
  enabledServers: ReadonlyArray<ServerProfile>;
  statuses: Map<string, ServerRuntimeInfo>;
  installationInfo: Map<string, ServerInstallationInfo>;
  officialSteamBuild: string | null;
  playerListsByServer: Map<string, PlayerListState>;
}): OverviewFleetComputed {
  const attentionIssues = collectAttentionIssues({
    servers: input.enabledServers,
    statuses: input.statuses,
    installationInfo: input.installationInfo,
    officialSteamBuild: input.officialSteamBuild,
  });
  const attentionServerIds = new Set(attentionIssues.map((issue) => issue.serverId));

  const updateServerIds = new Set<string>();
  let runningCount = 0;
  let stoppedCount = 0;

  for (const server of input.enabledServers) {
    const status = runtimeStatus(input.statuses, server.id);
    if (status === "running") {
      runningCount += 1;
    } else if (status === "stopped") {
      stoppedCount += 1;
    }

    const installation = input.installationInfo.get(server.id) ?? null;
    if (
      installation != null &&
      isInstallationReady(installation) &&
      getServerUpdateState(installation, input.officialSteamBuild) === "available"
    ) {
      updateServerIds.add(server.id);
    }
  }

  return {
    stats: {
      enabledCount: input.enabledServers.length,
      runningCount,
      survivorsOnlineTotal: sumSurvivorsOnlineTotal({
        enabledServers: input.enabledServers,
        statuses: input.statuses,
        playerListsByServer: input.playerListsByServer,
      }),
      stoppedCount,
      attentionCount: attentionServerIds.size,
      updatesCount: updateServerIds.size,
      attentionServerIds,
      updateServerIds,
    },
    attentionIssues,
  };
}

export function filterOverviewServersByFleet(
  servers: ReadonlyArray<ServerProfile>,
  filter: OverviewFleetFilter,
  stats: OverviewFleetStats,
  statuses: Map<string, ServerRuntimeInfo>,
): ServerProfile[] {
  if (filter === "all") {
    return [...servers];
  }
  if (filter === "running") {
    return servers.filter(
      (server) => runtimeStatus(statuses, server.id) === "running",
    );
  }
  if (filter === "stopped") {
    return servers.filter(
      (server) => runtimeStatus(statuses, server.id) === "stopped",
    );
  }
  if (filter === "attention") {
    return servers.filter((server) => stats.attentionServerIds.has(server.id));
  }
  return servers.filter((server) => stats.updateServerIds.has(server.id));
}

export function toggleOverviewFleetFilter(
  current: OverviewFleetFilter,
  next: OverviewFleetFilter,
): OverviewFleetFilter {
  return current === next ? "all" : next;
}
