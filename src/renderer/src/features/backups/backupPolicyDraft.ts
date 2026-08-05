import type { BackupDiskAlertSettings, BackupPolicy } from "@shared/types";

export type BackupPolicyDraft = Omit<BackupPolicy, "serverId" | "updatedAt">;

export function toBackupPolicyDraft(policy: BackupPolicy): BackupPolicyDraft {
  return {
    enabled: policy.enabled,
    intervalMinutes: policy.intervalMinutes,
    retainCountWorld: policy.retainCountWorld,
    retainCountPlayers: policy.retainCountPlayers,
    retainCountIni: policy.retainCountIni,
    backupDir: policy.backupDir,
  };
}

export function isBackupPolicyDraftDirty(
  draft: BackupPolicyDraft,
  policy: BackupPolicy,
): boolean {
  return (
    draft.enabled !== policy.enabled ||
    draft.intervalMinutes !== policy.intervalMinutes ||
    draft.retainCountWorld !== policy.retainCountWorld ||
    draft.retainCountPlayers !== policy.retainCountPlayers ||
    draft.retainCountIni !== policy.retainCountIni ||
    (draft.backupDir ?? null) !== (policy.backupDir ?? null)
  );
}

export function isBackupDiskDraftDirty(
  draft: BackupDiskAlertSettings,
  saved: BackupDiskAlertSettings,
): boolean {
  return (
    draft.warnUsedPercent !== saved.warnUsedPercent ||
    draft.criticalUsedPercent !== saved.criticalUsedPercent ||
    draft.warnFreeBytes !== saved.warnFreeBytes
  );
}
