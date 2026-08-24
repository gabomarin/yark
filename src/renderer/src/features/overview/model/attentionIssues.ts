import {
  installationHealthLabel,
  isInstallationReady,
} from "@shared/installation-health";
import { getServerUpdateState } from "@shared/server-update-status";
import type {
  ServerInstallationInfo,
  ServerProfile,
  ServerRuntimeInfo,
} from "@shared/types";

export interface AttentionIssue {
  serverId: string;
  serverName: string;
  problem: string;
  guidance: string;
  checkedAt: string | null;
}

export function collectAttentionIssues(input: {
  servers: ReadonlyArray<ServerProfile>;
  statuses: Map<string, ServerRuntimeInfo>;
  installationInfo: Map<string, ServerInstallationInfo>;
  officialSteamBuild: string | null;
}): AttentionIssue[] {
  const issues: AttentionIssue[] = [];
  for (const server of input.servers) {
    const status = input.statuses.get(server.id)?.status ?? "stopped";
    const installation = input.installationInfo.get(server.id) ?? null;

    if (status === "error") {
      const lastError = input.statuses.get(server.id)?.lastError?.trim();
      issues.push({
        serverId: server.id,
        serverName: server.name,
        problem: "Runtime error",
        guidance:
          lastError && lastError.length > 0
            ? lastError
            : "Open Logs to inspect the failure, then restart if the install is healthy.",
        checkedAt: installation?.checkedAt ?? null,
      });
      continue;
    }

    // Missing snapshot = not checked yet (scan pending). `unknown` is a final result.
    if (installation == null) {
      continue;
    }

    if (!isInstallationReady(installation)) {
      issues.push({
        serverId: server.id,
        serverName: server.name,
        problem: installationHealthLabel(installation.health),
        guidance:
          installation.guidance ||
          "Check the install path, then use Install or Check Servers Health.",
        checkedAt: installation.checkedAt,
      });
      continue;
    }

    if (getServerUpdateState(installation, input.officialSteamBuild) === "available") {
      issues.push({
        serverId: server.id,
        serverName: server.name,
        problem: "Update available",
        guidance: "Use Update on the server card when you are ready.",
        checkedAt: installation.checkedAt,
      });
    }
  }
  return issues;
}
