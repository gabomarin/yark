import type { BackupKind, BackupPolicy } from "@shared/types";

export const ALL_BACKUP_KINDS: readonly BackupKind[] = ["world", "players", "ini"];

export function retainCountForKind(policy: BackupPolicy, kind: BackupKind): number {
  if (kind === "world") return policy.retainCountWorld;
  if (kind === "players") return policy.retainCountPlayers;
  return policy.retainCountIni;
}

export function assertRetainCount(label: string, value: number): void {
  if (value < 1 || value > 500) {
    throw new Error(`${label} must be between 1 and 500`);
  }
}
