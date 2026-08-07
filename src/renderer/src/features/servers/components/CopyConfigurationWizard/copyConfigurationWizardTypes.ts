import type { ConfigTransferCommitResult } from "@shared/types";

export interface CopyConfigTargetOutcome {
  targetId: string;
  targetName: string;
  ok: boolean;
  result?: ConfigTransferCommitResult;
  error?: string;
}
