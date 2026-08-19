import {
  decideFilesJobEnqueue,
  occupyingFilesJobForServer,
  type FilesJobEnqueueDecision,
  type FilesJobOccupant,
} from "@shared/files-job-priority";
import { isInstallationReady } from "@shared/installation-health";
import {
  getServerUpdateState,
} from "@shared/server-update-status";
import type {
  CriticalJobSummary,
  ServerInstallationInfo,
  ServerProfile,
  ServerRuntimeInfo,
  ServerStatus,
} from "@shared/types";

export type UpdateAllOutdatedSkipReason =
  | "disabled"
  | "install-not-ready"
  | "update-unknown"
  | "server-running"
  | "files-job-active"
  | "files-job-duplicate"
  | "files-job-paused"
  | "files-job-occupied";

export type UpdateAllOutdatedRow = {
  serverId: string;
  serverName: string;
  installBuild: string | null;
  officialBuild: string | null;
  status: ServerStatus | null;
  eligible: boolean;
  skipReason: UpdateAllOutdatedSkipReason | null;
  skipLabel: string | null;
};

export type UpdateAllOutdatedPlan = {
  officialBuild: string | null;
  rows: UpdateAllOutdatedRow[];
  eligible: UpdateAllOutdatedRow[];
  skipped: UpdateAllOutdatedRow[];
};

export type UpdateAllOutdatedQueueResult =
  | { action: "queued" }
  | { action: "already-in-downloads"; message: string }
  | { action: "replaced-verify"; message: string }
  | { action: "failed"; message: string };

const ACTIVE_SERVER_STATUSES = new Set<ServerStatus>([
  "running",
  "starting",
  "stopping",
]);

function skipCopy(reason: UpdateAllOutdatedSkipReason): string {
  switch (reason) {
    case "disabled":
      return "Profile disabled — enable it before updating.";
    case "install-not-ready":
      return "Install files are not ready — run Install or Verify first.";
    case "update-unknown":
      return "Could not compare Steam builds — run Check server updates or Verify.";
    case "server-running":
      return "Server is running — stop it before a safe update.";
    case "files-job-active":
      return "A files job is already running — wait or cancel it in Downloads.";
    case "files-job-duplicate":
      return "Update is already in Downloads for this server.";
    case "files-job-paused":
      return "Update is paused in Downloads — resume it there.";
    case "files-job-occupied":
      return "Another files job is already queued in Downloads.";
  }
}

function filesJobSkipReason(
  decision: FilesJobEnqueueDecision,
): UpdateAllOutdatedSkipReason | null {
  switch (decision.action) {
    case "enqueue":
    case "replace":
      return null;
    case "reject-running":
      return "files-job-active";
    case "reject-duplicate":
      return "files-job-duplicate";
    case "reject-paused":
      return "files-job-paused";
    case "reject-occupied":
      return "files-job-occupied";
    default: {
      const _exhaustive: never = decision;
      return _exhaustive;
    }
  }
}

export function buildUpdateAllOutdatedPlan(input: {
  servers: readonly ServerProfile[];
  installationInfo: ReadonlyMap<string, ServerInstallationInfo>;
  statuses: ReadonlyMap<string, ServerRuntimeInfo>;
  officialSteamBuild: string | null;
  criticalJobs?: readonly CriticalJobSummary[];
}): UpdateAllOutdatedPlan {
  const rows: UpdateAllOutdatedRow[] = [];

  for (const server of input.servers) {
    const installation = input.installationInfo.get(server.id);
    const updateState = getServerUpdateState(installation, input.officialSteamBuild);
    if (updateState === "current") {
      continue;
    }
    if (input.officialSteamBuild == null && updateState === "unknown") {
      continue;
    }

    const status = input.statuses.get(server.id)?.status ?? null;
    let skipReason: UpdateAllOutdatedSkipReason | null = null;

    if (!server.enabled) {
      skipReason = "disabled";
    } else if (!isInstallationReady(installation)) {
      skipReason = "install-not-ready";
    } else if (updateState === "unknown") {
      skipReason = "update-unknown";
    } else if (status !== null && ACTIVE_SERVER_STATUSES.has(status)) {
      skipReason = "server-running";
    } else {
      const occupant = occupyingFilesJobForServer(
        input.criticalJobs ?? [],
        server.id,
      );
      skipReason = filesJobSkipReason(decideFilesJobEnqueue("update", occupant));
    }

    rows.push({
      serverId: server.id,
      serverName: server.name,
      installBuild: installation?.steamBuild ?? null,
      officialBuild: input.officialSteamBuild,
      status,
      eligible: skipReason === null,
      skipReason,
      skipLabel: skipReason === null ? null : skipCopy(skipReason),
    });
  }

  rows.sort((a, b) => a.serverName.localeCompare(b.serverName, undefined, { sensitivity: "base" }));

  const eligible = rows.filter((row) => row.eligible);
  const skipped = rows.filter((row) => !row.eligible);

  return {
    officialBuild: input.officialSteamBuild,
    rows,
    eligible,
    skipped,
  };
}

export function canOpenUpdateAllOutdated(plan: UpdateAllOutdatedPlan): boolean {
  return plan.eligible.length > 0;
}

export function classifyUpdateAllOutdatedQueueResult(input: {
  ok: boolean;
  error?: string;
}): UpdateAllOutdatedQueueResult {
  if (input.ok) {
    return { action: "queued" };
  }

  const message = input.error ?? "Unknown error";
  if (/Replaced by .+ in the Downloads queue/i.test(message)) {
    return { action: "replaced-verify", message };
  }
  if (
    /already in the Downloads queue|already in Downloads|Resume it from Downloads|Cancel it first, or wait/i.test(
      message,
    )
  ) {
    return { action: "already-in-downloads", message };
  }
  return { action: "failed", message };
}

export function summarizeUpdateAllOutdatedQueue(input: {
  queuedCount: number;
  replacedCount: number;
  failedCount: number;
  skippedCount: number;
}): { title: string; message: string; color: "teal" | "blue" | "orange" | "red" } {
  if (input.queuedCount === 0 && input.replacedCount === 0) {
    return {
      title: "No updates queued",
      message:
        input.failedCount > 0
          ? "Every eligible server failed to queue. Open Downloads for details."
          : "No eligible servers were ready to queue.",
      color: "orange",
    };
  }

  const parts: string[] = [];
  if (input.queuedCount > 0) {
    parts.push(
      `${input.queuedCount} update${input.queuedCount === 1 ? "" : "s"} queued in Downloads`,
    );
  }
  if (input.replacedCount > 0) {
    parts.push(
      `${input.replacedCount} queued Verify job${input.replacedCount === 1 ? "" : "s"} replaced`,
    );
  }
  if (input.skippedCount > 0) {
    parts.push(`${input.skippedCount} skipped`);
  }
  if (input.failedCount > 0) {
    parts.push(`${input.failedCount} failed to queue`);
  }

  return {
    title:
      input.queuedCount + input.replacedCount === 1
        ? "Update queued"
        : "Updates queued",
    message: `${parts.join(". ")}. Jobs run one at a time through Downloads. Jobs that cannot start yet (for example missing SteamCMD) show as blocked with Retry.`,
    color: input.failedCount > 0 ? "orange" : "blue",
  };
}

/** @internal test helper */
export function __testOnlyOccupant(
  operation: FilesJobOccupant["operation"],
  status: FilesJobOccupant["status"],
): FilesJobOccupant {
  return { id: "test", operation, status };
}
