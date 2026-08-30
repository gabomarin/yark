import type { BackupKind, BackupPolicy } from "@shared/types";

export const ALL_BACKUP_KINDS: readonly BackupKind[] = ["world", "players", "ini"];

export function retainCountForKind(policy: BackupPolicy, kind: BackupKind): number {
  if (kind === "world") return policy.retainCountWorld;
  if (kind === "players") return policy.retainCountPlayers;
  return policy.retainCountIni;
}

/** Pool key for world retain-N (per map token). Unscoped rows share one pool. */
export function worldRetentionKey(backup: { mapToken: string | null }): string {
  return backup.mapToken?.trim().toLowerCase() || "__unscoped__";
}

export function assertRetainCount(label: string, value: number): void {
  if (value < 1 || value > 500) {
    throw new Error(`${label} must be between 1 and 500`);
  }
}
