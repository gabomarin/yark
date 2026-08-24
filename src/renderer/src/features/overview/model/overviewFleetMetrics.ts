import { isInstallationReady } from "@shared/installation-health";
import { getServerUpdateState } from "@shared/server-update-status";
import type {
  ServerInstallationInfo,
  ServerProfile,
  ServerRuntimeInfo,
} from "@shared/types";
import { collectAttentionIssues } from "./attentionIssues";

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
  stoppedCount: number;
  attentionCount: number;
  updatesCount: number;
  attentionServerIds: ReadonlySet<string>;
  updateServerIds: ReadonlySet<string>;
}

function runtimeStatus(
  statuses: Map<string, ServerRuntimeInfo>,
  serverId: string,
): ServerRuntimeInfo["status"] {
  return statuses.get(serverId)?.status ?? "stopped";
}

/** Counts from the enabled fleet only — not search-narrowed. */
export function computeOverviewFleetStats(input: {
  enabledServers: ReadonlyArray<ServerProfile>;
  statuses: Map<string, ServerRuntimeInfo>;
  installationInfo: Map<string, ServerInstallationInfo>;
  officialSteamBuild: string | null;
}): OverviewFleetStats {
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
    enabledCount: input.enabledServers.length,
    runningCount,
    stoppedCount,
    attentionCount: attentionServerIds.size,
    updatesCount: updateServerIds.size,
    attentionServerIds,
    updateServerIds,
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
