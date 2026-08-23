import { isFilesJobOperation, type FilesJobOperation } from "@shared/files-job-priority";
import type { ServerFilesQueueState } from "@features/downloads/downloadsModel";
import type { SteamCmdStatus } from "@shared/types";

export interface WorkspaceFilesJobState {
  filesJobActive: boolean;
  filesJobOperation: FilesJobOperation | null;
  filesJobQueueKind: ServerFilesQueueState["kind"] | null;
  filesJobLabel: string | null;
}

function liveFilesJobLabel(
  steamCmdStatus: SteamCmdStatus,
): string {
  if (steamCmdStatus.operation === "update") return "Updating server files";
  if (steamCmdStatus.operation === "verify-files") return "Verifying server files";
  if (steamCmdStatus.operation === "install-files") return "Installing server files";
  if (steamCmdStatus.operation === "sync-files") return "Copying files to this server";
  return "Updating server files";
}

export function resolveWorkspaceFilesJobState(
  serverId: string,
  filesQueueByServerId: Map<string, ServerFilesQueueState>,
  steamCmdBusy: boolean,
  steamCmdStatus: SteamCmdStatus | null,
): WorkspaceFilesJobState {
  const queued = filesQueueByServerId.get(serverId);
  const liveOnServer =
    steamCmdBusy && steamCmdStatus?.serverId === serverId;

  let filesJobOperation: WorkspaceFilesJobState["filesJobOperation"] = null;
  if (queued !== undefined && isFilesJobOperation(queued.operation)) {
    filesJobOperation = queued.operation;
  } else if (liveOnServer && isFilesJobOperation(steamCmdStatus?.operation)) {
    filesJobOperation = steamCmdStatus.operation;
  }

  const filesJobQueueKind =
    queued?.kind
    ?? (liveOnServer ? "active" : null);

  let filesJobLabel: string | null = null;
  if (queued?.kind === "queued") {
    filesJobLabel = queued.label ?? "Queued in Downloads";
  } else if (liveOnServer && steamCmdStatus !== null) {
    filesJobLabel = liveFilesJobLabel(steamCmdStatus);
  } else {
    filesJobLabel = queued?.label ?? null;
  }

  return {
    filesJobActive: queued !== undefined || liveOnServer,
    filesJobOperation,
    filesJobQueueKind,
    filesJobLabel,
  };
}
