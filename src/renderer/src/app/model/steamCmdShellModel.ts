import type { ServerFilesQueueState } from "@features/downloads/downloadsModel";

export type SteamCmdCardJobRef = {
  jobId: string;
  label: string;
  operation: "install-files" | "update" | "verify-files";
};

export function steamCmdCardJobsByKind(
  queue: Map<string, ServerFilesQueueState>,
  kind: "paused" | "queued",
): Map<string, SteamCmdCardJobRef> {
  const map = new Map<string, SteamCmdCardJobRef>();
  for (const [serverId, state] of queue) {
    if (state.kind !== kind) continue;
    if (
      state.operation !== "install-files"
      && state.operation !== "update"
      && state.operation !== "verify-files"
    ) {
      continue;
    }
    map.set(serverId, {
      jobId: state.jobId,
      label: state.label,
      operation: state.operation,
    });
  }
  return map;
}
