import type { CriticalJobOperation, CriticalJobSummary } from "@shared/types";
import { FILES_QUEUE_OPERATIONS, operationTitle } from "./downloadsOperationCopy";

type ServerFilesQueueKind = "active" | "paused" | "queued";

export type ServerFilesQueueState = {
  kind: ServerFilesQueueKind;
  jobId: string;
  operation: CriticalJobOperation;
  label: string;
};

const QUEUE_KIND_RANK: Record<ServerFilesQueueKind, number> = {
  active: 0,
  paused: 1,
  queued: 2,
};

function queueKindForJob(status: CriticalJobSummary["status"]): ServerFilesQueueKind | null {
  if (status === "running") return "active";
  if (status === "paused") return "paused";
  if (status === "pending" || status === "retrying") return "queued";
  return null;
}

/** Latest install/update/verify job per server (active wins over paused over queued). */
export function filesQueueStateByServerId(
  jobs: CriticalJobSummary[] | undefined,
): Map<string, ServerFilesQueueState> {
  const map = new Map<string, ServerFilesQueueState>();
  for (const job of jobs ?? []) {
    if (!FILES_QUEUE_OPERATIONS.has(job.operation)) continue;
    const kind = queueKindForJob(job.status);
    if (kind === null) continue;
    const current = map.get(job.serverId);
    if (current !== undefined && QUEUE_KIND_RANK[current.kind] <= QUEUE_KIND_RANK[kind]) {
      continue;
    }
    const title = operationTitle(job.operation);
    map.set(job.serverId, {
      kind,
      jobId: job.id,
      operation: job.operation,
      label:
        kind === "queued"
          ? `Queued · ${title}`
          : kind === "paused"
            ? `Paused · ${title}`
            : title,
    });
  }
  return map;
}
