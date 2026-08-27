import { playerBackupDisplayName } from "@shared/backup-player-meta";
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

const relativeTimeFormat = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

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

function truncateMiddle(value: string, max = 42): string {
  if (value.length <= max) return value;
  const keep = Math.floor((max - 1) / 2);
  return `${value.slice(0, keep)}…${value.slice(-keep)}`;
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

export function worldPolicySummary(
  draft: DraftPolicy,
  resolvedRoot: string | null,
  defaultHint: string,
): string {
  const schedule = draft.enabled
    ? `Schedule on · ${draft.intervalMinutes}m`
    : "Schedule off";
  const dest =
    draft.backupDir !== null && draft.backupDir.length > 0
      ? draft.backupDir
      : (resolvedRoot ?? defaultHint);
  return `${schedule} · keep ${draft.retainCountWorld} · ${truncateMiddle(dest)}`;
}

export function playersPolicySummary(draft: DraftPolicy): string {
  return `Keep last ${draft.retainCountPlayers} per player`;
}

export function iniPolicySummary(draft: DraftPolicy): string {
  return `Keep last ${draft.retainCountIni}`;
}

export type ServerBackupMetricStrip = {
  lastBackupValue: string;
  lastBackupHint: string;
  retainValue: string;
  retainHint: string;
  destinationValue: string;
  destinationHint: string;
};

function retainForKind(draft: DraftPolicy, kind: BackupKind): number {
  if (kind === "players") return draft.retainCountPlayers;
  if (kind === "ini") return draft.retainCountIni;
  return draft.retainCountWorld;
}

function newestCompletedBackup(
  backups: BackupRecord[],
  kind: BackupKind,
): BackupRecord | null {
  let best: BackupRecord | null = null;
  let bestMs = Number.NEGATIVE_INFINITY;
  for (const backup of backups) {
    if (backup.kind !== kind || backup.status !== "completed") continue;
    const stamp = backup.completedAt ?? backup.createdAt;
    const ms = new Date(stamp).getTime();
    if (Number.isNaN(ms) || ms < bestMs) continue;
    best = backup;
    bestMs = ms;
  }
  return best;
}

function destinationDisplay(
  draft: DraftPolicy | null,
  resolvedRoot: string | null,
  defaultBackupHint: string,
): { value: string; hint: string } {
  const custom =
    draft?.backupDir !== null && draft?.backupDir !== undefined && draft.backupDir.length > 0
      ? draft.backupDir
      : null;
  const full = custom ?? resolvedRoot ?? defaultBackupHint;
  return {
    value: truncateMiddle(full, 28),
    hint: custom !== null ? "Custom destination" : "Default under install",
  };
}

/** Per-server scalars for the embedded Backups metric strip (#231) — list + policy only. */
export function buildServerBackupMetricStrip(input: {
  backups: BackupRecord[];
  kind: BackupKind;
  draft: DraftPolicy | null;
  resolvedRoot: string | null;
  defaultBackupHint: string;
  nowMs?: number;
}): ServerBackupMetricStrip {
  const { backups, kind, draft, resolvedRoot, defaultBackupHint, nowMs } = input;
  const latest = newestCompletedBackup(backups, kind);
  const stamp = latest?.completedAt ?? latest?.createdAt ?? null;
  const dest = destinationDisplay(draft, resolvedRoot, defaultBackupHint);
  const retain = draft !== null ? retainForKind(draft, kind) : null;

  return {
    lastBackupValue:
      stamp !== null ? formatRelativeTime(stamp, nowMs) : "Never",
    lastBackupHint:
      latest !== null
        ? `${kindLabel(kind)} · ${latest.type}`
        : `No completed ${kindLabel(kind).toLowerCase()} yet`,
    retainValue: retain !== null ? String(retain) : "–",
    retainHint:
      kind === "players"
        ? "Per player"
        : kind === "ini"
          ? "INI archives"
          : "Per map",
    destinationValue: dest.value,
    destinationHint: dest.hint,
  };
}
