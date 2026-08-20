/**
 * One occupying files job per server. Higher weight replaces a queued weaker
 * job (Verify < Install/Update). Never interrupts a running SteamCMD job.
 */

export type FilesJobOperation = "install-files" | "update" | "verify-files";

export const FILES_JOB_WEIGHT: Record<FilesJobOperation, number> = {
  "verify-files": 1,
  "install-files": 2,
  update: 2,
};

const FILES_JOB_ACTION_LABEL: Record<FilesJobOperation, string> = {
  "install-files": "Install",
  update: "Update",
  "verify-files": "Verify",
};

const OCCUPYING_STATUSES = new Set(["pending", "retrying", "running", "paused"]);

export type FilesJobOccupant = {
  id: string;
  operation: FilesJobOperation;
  status: string;
};

export type FilesJobEnqueueDecision =
  | { action: "enqueue" }
  | { action: "replace"; occupant: FilesJobOccupant }
  | { action: "reject-duplicate"; occupant: FilesJobOccupant }
  | { action: "reject-paused"; occupant: FilesJobOccupant }
  | { action: "reject-running"; occupant: FilesJobOccupant }
  | { action: "reject-occupied"; occupant: FilesJobOccupant };

export class FilesJobSupersededError extends Error {
  readonly replacedBy: FilesJobOperation;

  constructor(replacedBy: FilesJobOperation) {
    super(
      `Replaced by ${FILES_JOB_ACTION_LABEL[replacedBy]} in the Downloads queue.`,
    );
    this.name = "FilesJobSupersededError";
    this.replacedBy = replacedBy;
  }
}

export function isFilesJobOperation(value: string | null | undefined): value is FilesJobOperation {
  return value === "install-files" || value === "update" || value === "verify-files";
}

export function isOccupyingFilesJobStatus(status: string): boolean {
  return OCCUPYING_STATUSES.has(status);
}

export function pickOccupyingFilesJob(
  jobs: readonly FilesJobOccupant[],
): FilesJobOccupant | null {
  if (jobs.length === 0) return null;
  const running = jobs.find((job) => job.status === "running");
  if (running !== undefined) return running;
  return jobs.reduce((best, job) =>
    FILES_JOB_WEIGHT[job.operation] > FILES_JOB_WEIGHT[best.operation] ? job : best,
  );
}

export function occupyingFilesJobForServer(
  jobs: ReadonlyArray<{
    id: string;
    serverId: string;
    operation: string;
    status: string;
  }>,
  serverId: string,
): FilesJobOccupant | null {
  const occupying: FilesJobOccupant[] = [];
  for (const job of jobs) {
    if (job.serverId !== serverId) continue;
    if (!isFilesJobOperation(job.operation)) continue;
    if (!isOccupyingFilesJobStatus(job.status)) continue;
    occupying.push({
      id: job.id,
      operation: job.operation,
      status: job.status,
    });
  }
  return pickOccupyingFilesJob(occupying);
}

export function filesJobOccupantFromUi(input: {
  busy?: boolean;
  paused?: boolean;
  queued?: boolean;
  operation?: string | null;
}): FilesJobOccupant | null {
  if (input.busy === true) {
    return {
      id: "ui",
      operation: isFilesJobOperation(input.operation) ? input.operation : "update",
      status: "running",
    };
  }
  if (input.paused === true) {
    return {
      id: "ui",
      operation: isFilesJobOperation(input.operation) ? input.operation : "update",
      status: "paused",
    };
  }
  if (input.queued === true) {
    return {
      id: "ui",
      operation: isFilesJobOperation(input.operation) ? input.operation : "update",
      status: "pending",
    };
  }
  return null;
}

export function filesQueueKindToStatus(
  kind: "active" | "paused" | "queued",
): string {
  if (kind === "active") return "running";
  if (kind === "paused") return "paused";
  return "pending";
}

export function decideFilesJobEnqueue(
  incoming: FilesJobOperation,
  occupant: FilesJobOccupant | null,
): FilesJobEnqueueDecision {
  if (occupant === null) return { action: "enqueue" };
  if (occupant.operation === incoming) {
    if (occupant.status === "paused") {
      return { action: "reject-paused", occupant };
    }
    return { action: "reject-duplicate", occupant };
  }
  if (occupant.status === "running") {
    return { action: "reject-running", occupant };
  }
  if (FILES_JOB_WEIGHT[incoming] > FILES_JOB_WEIGHT[occupant.operation]) {
    return { action: "replace", occupant };
  }
  return { action: "reject-occupied", occupant };
}

export function canEnqueueFilesJobFromMenu(
  incoming: FilesJobOperation,
  occupant: FilesJobOccupant | null,
): boolean {
  const action = decideFilesJobEnqueue(incoming, occupant).action;
  return action === "enqueue" || action === "replace";
}

export function filesJobEnqueueCopy(
  incoming: FilesJobOperation,
  decision: Exclude<FilesJobEnqueueDecision, { action: "enqueue" }>,
  serverName: string,
): { title: string; message: string } {
  const incomingLabel = FILES_JOB_ACTION_LABEL[incoming];
  const occupantLabel = FILES_JOB_ACTION_LABEL[decision.occupant.operation];
  if (decision.action === "replace") {
    return {
      title: "Downloads queue updated",
      message: `${incomingLabel} replaced ${occupantLabel} for "${serverName}" in the queue.`,
    };
  }
  if (decision.action === "reject-paused") {
    return {
      title: "Paused in Downloads",
      message: `"${serverName}" is paused. Resume it from Downloads.`,
    };
  }
  if (decision.action === "reject-running") {
    return {
      title: "Already running",
      message: `${occupantLabel} is running for "${serverName}". Cancel it first, or wait.`,
    };
  }
  if (decision.action === "reject-occupied") {
    return {
      title: "Already in Downloads",
      message: `${occupantLabel} for "${serverName}" is already in Downloads. It already refreshes files.`,
    };
  }
  return {
    title: "Already in Downloads",
    message: `${incomingLabel} for "${serverName}" is already in the Downloads queue.`,
  };
}
