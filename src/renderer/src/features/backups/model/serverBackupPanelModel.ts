import { playerBackupDisplayName } from "@shared/backup-player-meta";
import { formatLogDateTime } from "@shared/format-log-datetime";
import type {
  BackupKind,
  BackupPolicy,
  BackupRecord,
  ServerRuntimeInfo,
} from "@shared/types";

export type DraftPolicy = Omit<BackupPolicy, "serverId" | "updatedAt">;

export const KIND_TABS: Array<{ kind: BackupKind; label: string }> = [
  { kind: "world", label: "World save" },
  { kind: "players", label: "Player profiles" },
  { kind: "ini", label: "INI" },
];

/** English only until app i18n (#515). Do not use the OS locale. */
const relativeTimeFormat = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** Relative primary label for backups younger than this; absolute beyond. */
export const BACKUP_WHEN_RECENT_MS = 24 * 60 * 60 * 1000;

export type BackupWhenLabel = {
  primary: string;
  tooltip: string;
};

export function formatSize(sizeBytes: number): string {
  if (sizeBytes <= 0) return "–";
  if (sizeBytes >= 1024 * 1024) {
    return `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  return `${(sizeBytes / 1024).toFixed(1)} KB`;
}

export function formatRelativeTime(iso: string, nowMs = Date.now()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const diffSec = Math.round((date.getTime() - nowMs) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 60) return relativeTimeFormat.format(diffSec, "second");
  const diffMin = Math.round(diffSec / 60);
  if (Math.abs(diffMin) < 60) return relativeTimeFormat.format(diffMin, "minute");
  const diffHour = Math.round(diffMin / 60);
  if (Math.abs(diffHour) < 24) return relativeTimeFormat.format(diffHour, "hour");
  const diffDay = Math.round(diffHour / 24);
  if (Math.abs(diffDay) < 30) return relativeTimeFormat.format(diffDay, "day");
  const diffMonth = Math.round(diffDay / 30);
  if (Math.abs(diffMonth) < 12) return relativeTimeFormat.format(diffMonth, "month");
  return relativeTimeFormat.format(Math.round(diffMonth / 12), "year");
}

/**
 * Backup history Date cell: English relative within 24h, local timestamp older.
 * Tooltip always shows the alternate form (#515).
 */
export function formatBackupWhenLabel(
  iso: string,
  nowMs = Date.now(),
  options?: { recentThresholdMs?: number },
): BackupWhenLabel {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return { primary: iso, tooltip: iso };
  }
  const threshold = options?.recentThresholdMs ?? BACKUP_WHEN_RECENT_MS;
  const relative = formatRelativeTime(iso, nowMs);
  const absolute = formatLogDateTime(iso, { fallback: iso });
  const ageMs = Math.abs(date.getTime() - nowMs);
  if (ageMs < threshold) {
    return { primary: relative, tooltip: absolute };
  }
  return { primary: absolute, tooltip: relative };
}

export function kindLabel(kind: BackupKind): string {
  return KIND_TABS.find((tab) => tab.kind === kind)?.label ?? "World save";
}

export function isServerActive(runtime: ServerRuntimeInfo | null | undefined): boolean {
  const status = runtime?.status ?? "stopped";
  return status === "running" || status === "starting" || status === "stopping";
}

export function toDraft(policy: BackupPolicy): DraftPolicy {
  return {
    enabled: policy.enabled,
    intervalMinutes: policy.intervalMinutes,
    retainCountWorld: policy.retainCountWorld,
    retainCountPlayers: policy.retainCountPlayers,
    retainCountIni: policy.retainCountIni,
    backupDir: policy.backupDir,
  };
}

export function draftEqualsPolicy(
  draft: DraftPolicy,
  policy: BackupPolicy,
): boolean {
  return (
    draft.enabled === policy.enabled
    && draft.intervalMinutes === policy.intervalMinutes
    && draft.retainCountWorld === policy.retainCountWorld
    && draft.retainCountPlayers === policy.retainCountPlayers
    && draft.retainCountIni === policy.retainCountIni
    && draft.backupDir === policy.backupDir
  );
}

export function draftEqualsDraft(a: DraftPolicy, b: DraftPolicy): boolean {
  return (
    a.enabled === b.enabled
    && a.intervalMinutes === b.intervalMinutes
    && a.retainCountWorld === b.retainCountWorld
    && a.retainCountPlayers === b.retainCountPlayers
    && a.retainCountIni === b.retainCountIni
    && a.backupDir === b.backupDir
  );
}

function sameMapToken(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const left = (a ?? "").trim().toLowerCase();
  const right = (b ?? "").trim().toLowerCase();
  return left.length > 0 && right.length > 0 && left === right;
}

export function backupsListKey(rows: BackupRecord[]): string {
  return rows
    .map((backup) =>
      [
        backup.id,
        backup.status,
        backup.type,
        backup.kind,
        String(backup.sizeBytes),
        backup.createdAt,
        backup.completedAt ?? "",
        backup.path,
        backup.notes ?? "",
        backup.mapToken ?? "",
      ].join(":"),
    )
    .join("\0");
}

export function filterBackups(
  backups: BackupRecord[],
  kind: BackupKind,
  playerSearch: string,
  currentMapOnly: boolean,
  serverMap: string,
): BackupRecord[] {
  const kindBackups = backups.filter((backup) => backup.kind === kind);
  if (kind === "players") {
    const query = playerSearch.trim().toLocaleLowerCase();
    if (query.length === 0) return kindBackups;
    return kindBackups.filter((backup) =>
      playerBackupDisplayName(backup).toLocaleLowerCase().includes(query),
    );
  }
  if (kind === "world" && currentMapOnly) {
    return kindBackups.filter((backup) =>
      sameMapToken(backup.mapToken, serverMap),
    );
  }
  return kindBackups;
}

export function countHiddenOtherMapWorldBackups(
  backups: BackupRecord[],
  kind: BackupKind,
  currentMapOnly: boolean,
  serverMap: string,
): number {
  if (kind !== "world" || !currentMapOnly) return 0;
  return backups.filter(
    (backup) =>
      backup.kind === "world" && !sameMapToken(backup.mapToken, serverMap),
  ).length;
}

export function worldPolicySummary(draft: DraftPolicy): string {
  const schedule = draft.enabled
    ? `Schedule on · ${draft.intervalMinutes}m`
    : "Schedule off";
  return `${schedule} · keep ${draft.retainCountWorld}`;
}

export function playersPolicySummary(draft: DraftPolicy): string {
  return `Keep last ${draft.retainCountPlayers} per player`;
}

export function iniPolicySummary(draft: DraftPolicy): string {
  return `Keep last ${draft.retainCountIni}`;
}
