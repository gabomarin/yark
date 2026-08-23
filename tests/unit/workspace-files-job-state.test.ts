import { describe, expect, it } from "vitest";
import { resolveWorkspaceFilesJobState } from "@renderer/app/workspaceFilesJobState";
import type { ServerFilesQueueState } from "@features/downloads/downloadsModel";
import type { SteamCmdStatus } from "@shared/types";

function queueState(
  partial: Pick<ServerFilesQueueState, "kind" | "operation" | "jobId" | "label">,
): ServerFilesQueueState {
  return partial;
}

describe("resolveWorkspaceFilesJobState", () => {
  it("prefers queued files job metadata when present", () => {
    const filesQueue = new Map<string, ServerFilesQueueState>([
      [
        "srv-1",
        queueState({
          kind: "queued",
          operation: "update",
          jobId: "job-1",
          label: "Queued in Downloads",
        }),
      ],
    ]);
    const result = resolveWorkspaceFilesJobState(
      "srv-1",
      filesQueue,
      true,
      { serverId: "srv-1", operation: "verify-files" } as SteamCmdStatus,
    );
    expect(result.filesJobActive).toBe(true);
    expect(result.filesJobOperation).toBe("update");
    expect(result.filesJobQueueKind).toBe("queued");
    expect(result.filesJobLabel).toBe("Queued in Downloads");
  });

  it("uses live SteamCMD status when no queue row exists", () => {
    const result = resolveWorkspaceFilesJobState(
      "srv-1",
      new Map(),
      true,
      {
        serverId: "srv-1",
        operation: "install-files",
      } as SteamCmdStatus,
    );
    expect(result.filesJobActive).toBe(true);
    expect(result.filesJobOperation).toBe("install-files");
    expect(result.filesJobQueueKind).toBe("active");
    expect(result.filesJobLabel).toBe("Installing server files");
  });
});
