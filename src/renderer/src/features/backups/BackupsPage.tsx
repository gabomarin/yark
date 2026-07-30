import type { ReactElement } from "react";
import {
  ArrowSquareOut,
  Broom,
  FloppyDisk,
  FolderOpen,
  HardDrives,
  WarningCircle,
} from "@phosphor-icons/react";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { PageScaffold } from "@layout/PageScaffold/PageScaffold";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";
import { EmptyState } from "@ui/EmptyState/EmptyState";
import { formatLogDateTime } from "@shared/format-log-datetime";
import type {
  BackupCleanupOptions,
  BackupCleanupPreview,
  BackupDiskAlertSettings,
  BackupFleetAlert,
  BackupFleetSummary,
  BackupHealthStatus,
  BackupPolicy,
  BackupServerHealth,
  ServerProfile,
} from "@shared/types";
import { useEffect, useMemo, useState } from "react";
import classes from "./BackupsPage.module.css";

interface Props {
  servers: ServerProfile[];
  onOpenServerBackups: (serverId: string) => void;
  onOpenServerLogs?: (serverId: string) => void;
}

type DraftPolicy = Omit<BackupPolicy, "serverId" | "updatedAt">;
type HealthFilter = "all" | "at_risk" | "failed" | "protected";

function formatWhen(iso: string | null | undefined): string {
  return formatLogDateTime(iso);
}

function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return "—";
  const abs = Math.abs(bytes);
  if (abs >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (abs >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (abs >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${Math.round(bytes)} B`;
}

function toDraft(policy: BackupPolicy): DraftPolicy {
  return {
    enabled: policy.enabled,
    intervalMinutes: policy.intervalMinutes,
    retainCountWorld: policy.retainCountWorld,
    retainCountPlayers: policy.retainCountPlayers,
    retainCountIni: policy.retainCountIni,
    backupDir: policy.backupDir,
  };
}

function healthColor(health: BackupHealthStatus): string {
  if (health === "ok") return "teal";
  if (health === "warning") return "yellow";
  if (health === "critical") return "red";
  return "gray";
}

function healthLabel(health: BackupHealthStatus): string {
  if (health === "ok") return "Protected";
  if (health === "warning") return "At risk";
  if (health === "critical") return "Critical";
  return "Unknown";
}

function alertColor(severity: BackupFleetAlert["severity"]): string {
  return severity === "error" ? "red" : "yellow";
}

const DEFAULT_CLEANUP: BackupCleanupOptions = {
  serverIds: null,
  includeFailed: true,
  enforceRetention: true,
  olderThanDays: null,
  keepLastPerKind: null,
  protectNewestWorld: true,
};

export function BackupsPage(props: Props): ReactElement {
  const [summary, setSummary] = useState<BackupFleetSummary | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftPolicy>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [browsingId, setBrowsingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [healthFilter, setHealthFilter] = useState<HealthFilter>("all");
  const [diskModalOpen, setDiskModalOpen] = useState(false);
  const [diskDraft, setDiskDraft] = useState<BackupDiskAlertSettings | null>(null);
  const [diskBusy, setDiskBusy] = useState(false);
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [cleanupOptions, setCleanupOptions] = useState<BackupCleanupOptions>(DEFAULT_CLEANUP);
  const [cleanupPreview, setCleanupPreview] = useState<BackupCleanupPreview | null>(null);
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [olderThanEnabled, setOlderThanEnabled] = useState(false);
  const [olderThanDays, setOlderThanDays] = useState(30);
  const [keepLastEnabled, setKeepLastEnabled] = useState(false);
  const [keepLastPerKind, setKeepLastPerKind] = useState(5);

  const load = async (opts?: { quiet?: boolean }) => {
    const quiet = opts?.quiet === true;
    if (!quiet) {
      setLoading(true);
    }
    setError(null);
    if (props.servers.length === 0) {
      setSummary(null);
      setDrafts({});
      setLoading(false);
      return;
    }

    const result = await window.api.getBackupFleetSummary();
    setLoading(false);
    if (!result.ok) {
      setSummary(null);
      setError(result.error ?? "Could not load backup summary");
      return;
    }

    setSummary(result.data);
    // Quiet refresh must not clobber in-progress policy edits.
    if (!quiet) {
      const nextDrafts: Record<string, DraftPolicy> = {};
      for (const row of result.data.servers) {
        nextDrafts[row.serverId] = toDraft(row.policy);
      }
      setDrafts(nextDrafts);
      setDiskDraft(result.data.diskSettings);
    }
  };

  useEffect(() => {
    void load();
  }, [props.servers]);

  useEffect(() => {
    if (typeof window.api.onBackupsChanged !== "function") return undefined;
    return window.api.onBackupsChanged(() => {
      void load({ quiet: true });
    });
  }, [props.servers]);

  const filteredServers = useMemo(() => {
    const rows = summary?.servers ?? [];
    if (healthFilter === "protected") {
      return rows.filter((row) => row.health === "ok");
    }
    if (healthFilter === "at_risk") {
      return rows.filter((row) => row.health === "warning" || row.health === "critical");
    }
    if (healthFilter === "failed") {
      return rows.filter((row) => row.counts.failed24h > 0);
    }
    return rows;
  }, [summary, healthFilter]);

  const worstDisk = useMemo(() => {
    const disks = summary?.disks ?? [];
    if (disks.length === 0) return null;
    return [...disks].sort(
      (a, b) => (b.usedPercent ?? -1) - (a.usedPercent ?? -1),
    )[0] ?? null;
  }, [summary]);

  const savePolicy = async (serverId: string) => {
    const draft = drafts[serverId];
    if (draft === undefined) return;
    setBusyId(serverId);
    setError(null);
    setInfo(null);
    const result = await window.api.setBackupPolicy(serverId, draft);
    setBusyId(null);
    if (!result.ok) {
      setError(result.error ?? "Could not save backup policy");
      return;
    }
    await load({ quiet: true });
    setInfo("Saved backup settings for the selected server.");
  };

  const browseBackupDir = async (server: ServerProfile) => {
    const draft = drafts[server.id];
    if (draft === undefined) return;
    setBrowsingId(server.id);
    const result = await window.api.pickPath(
      "directory",
      draft.backupDir ?? server.installDir,
      `Backup destination for ${server.name}`,
    );
    setBrowsingId(null);
    if (!result.ok) {
      setError(result.error ?? "Could not open folder picker");
      return;
    }
    if (result.data !== null) {
      setDrafts((previous) => ({
        ...previous,
        [server.id]: { ...draft, backupDir: result.data },
      }));
    }
  };

  const openDestination = async (serverId: string) => {
    setBusyId(serverId);
    setError(null);
    const result = await window.api.openBackupRoot(serverId);
    setBusyId(null);
    if (!result.ok) {
      setError(result.error ?? "Could not open backup destination");
    }
  };

  const saveDiskSettings = async () => {
    if (diskDraft === null) return;
    setDiskBusy(true);
    setError(null);
    const result = await window.api.setBackupDiskAlertSettings(diskDraft);
    setDiskBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Could not save disk alert settings");
      return;
    }
    setDiskModalOpen(false);
    await load();
    setInfo("Disk alert thresholds updated.");
  };

  const buildCleanupPayload = (): BackupCleanupOptions => ({
    ...cleanupOptions,
    olderThanDays: olderThanEnabled ? olderThanDays : null,
    keepLastPerKind: keepLastEnabled ? keepLastPerKind : null,
  });

  const runPreviewCleanup = async () => {
    setCleanupBusy(true);
    setError(null);
    const result = await window.api.previewBackupCleanup(buildCleanupPayload());
    setCleanupBusy(false);
    if (!result.ok) {
      setCleanupPreview(null);
      setError(result.error ?? "Could not preview cleanup");
      return;
    }
    setCleanupPreview(result.data);
  };

  const confirmCleanup = async () => {
    if (cleanupPreview === null || cleanupPreview.items.length === 0) return;
    setCleanupBusy(true);
    setError(null);
    const result = await window.api.runBackupCleanup({
      ...buildCleanupPayload(),
      confirmedBackupIds: cleanupPreview.items.map((item) => item.backup.id),
    });
    setCleanupBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Could not run cleanup");
      return;
    }
    setCleanupOpen(false);
    setCleanupPreview(null);
    await load();
    setInfo(
      `Cleanup removed ${result.data.deleted} backup${result.data.deleted === 1 ? "" : "s"} (${formatBytes(result.data.freedBytes)}).`,
    );
  };

  const serverById = useMemo(() => {
    const map = new Map(props.servers.map((server) => [server.id, server]));
    return map;
  }, [props.servers]);

  return (
    <PageScaffold
      title="Backups"
      subtitle="Backup health, disk usage, and shared destination settings across all servers. Create and restore from each server’s Backups tab."
      fillViewport
      actions={
        <Group gap="sm">
          <Button variant="default" onClick={() => void load()} loading={loading}>
            Refresh
          </Button>
          <Button
            leftSection={<Broom size={16} />}
            variant="light"
            disabled={props.servers.length === 0}
            onClick={() => {
              setCleanupOptions(DEFAULT_CLEANUP);
              setCleanupPreview(null);
              setOlderThanEnabled(false);
              setKeepLastEnabled(false);
              setCleanupOpen(true);
            }}
          >
            Cleanup…
          </Button>
        </Group>
      }
    >
      <Stack gap="md" className={classes.content}>
        {error !== null && (
          <Alert color="red" title="Backups" withCloseButton onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        {info !== null && (
          <Alert color="teal" title="Backups" withCloseButton onClose={() => setInfo(null)}>
            {info}
          </Alert>
        )}

        {props.servers.length === 0 ? (
          <AppSurfaceCard>
            <EmptyState
              icon={<HardDrives size={22} />}
              title="No servers yet"
              description="Create a server first to configure backups."
            />
          </AppSurfaceCard>
        ) : loading && summary === null ? (
          <AppSurfaceCard>
            <Text c="dimmed">Loading backup health…</Text>
          </AppSurfaceCard>
        ) : summary !== null ? (
          <>
            <div className={classes.statStrip}>
              <StatCard
                label="Protected"
                value={`${summary.stats.protectedCount}/${summary.servers.length}`}
                active={healthFilter === "protected"}
                onClick={() =>
                  setHealthFilter((prev) => (prev === "protected" ? "all" : "protected"))
                }
              />
              <StatCard
                label="At risk"
                value={String(summary.stats.atRiskCount)}
                tone={summary.stats.atRiskCount > 0 ? "warning" : "default"}
                active={healthFilter === "at_risk"}
                onClick={() =>
                  setHealthFilter((prev) => (prev === "at_risk" ? "all" : "at_risk"))
                }
              />
              <StatCard
                label="Failed (24h)"
                value={String(summary.stats.failed24h)}
                tone={summary.stats.failed24h > 0 ? "danger" : "default"}
                active={healthFilter === "failed"}
                onClick={() =>
                  setHealthFilter((prev) => (prev === "failed" ? "all" : "failed"))
                }
              />
              <StatCard
                label="Backup used"
                value={formatBytes(summary.stats.totalBackupBytes)}
              />
              <StatCard
                label="Disk free"
                value={
                  worstDisk?.freeBytes != null
                    ? formatBytes(worstDisk.freeBytes)
                    : "—"
                }
                hint={
                  summary.disks.length > 1
                    ? worstDisk != null
                      ? `Tightest: ${worstDisk.volumePath} · ${summary.disks.length} volumes`
                      : `${summary.disks.length} volumes`
                    : worstDisk?.usedPercent != null
                      ? `${worstDisk.volumePath} · ${worstDisk.usedPercent.toFixed(0)}% used`
                      : worstDisk?.volumePath
                }
                tone={
                  summary.alerts.some((alert) => alert.kind === "disk_critical")
                    ? "danger"
                    : summary.alerts.some((alert) => alert.kind === "disk_warning")
                      ? "warning"
                      : "default"
                }
                onClick={() => {
                  setDiskDraft(summary.diskSettings);
                  setDiskModalOpen(true);
                }}
              />
            </div>

            {summary.disks.length > 0 && (
              <Stack gap="xs">
                <Group justify="space-between" align="center">
                  <Title order={5}>Volumes</Title>
                  <Text size="xs" c="dimmed">
                    Thresholds apply per drive. Click Disk free to edit.
                  </Text>
                </Group>
                <div className={classes.volumeStrip}>
                  {summary.disks.map((disk) => {
                    const critical =
                      disk.usedPercent != null &&
                      disk.usedPercent >= summary.diskSettings.criticalUsedPercent;
                    const warning =
                      !critical &&
                      ((disk.usedPercent != null &&
                        disk.usedPercent >= summary.diskSettings.warnUsedPercent) ||
                        (disk.freeBytes != null &&
                          disk.freeBytes < summary.diskSettings.warnFreeBytes));
                    return (
                      <AppSurfaceCard
                        key={disk.volumePath}
                        tone="flat"
                        padding="sm"
                        radius="md"
                        className={[
                          classes.volumeCard,
                          critical ? classes.statDanger : "",
                          warning ? classes.statWarning : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        <Text fw={600} size="sm">
                          {disk.volumePath}
                        </Text>
                        <Text size="xs" c="dimmed">
                          Free {formatBytes(disk.freeBytes)}
                          {disk.usedPercent != null
                            ? ` · ${disk.usedPercent.toFixed(0)}% used`
                            : ""}
                        </Text>
                        <Text size="xs" c="dimmed">
                          Backups on this volume: {formatBytes(disk.backupBytes)}
                          {disk.roots.length > 1
                            ? ` · ${disk.roots.length} destinations`
                            : ""}
                        </Text>
                      </AppSurfaceCard>
                    );
                  })}
                </div>
              </Stack>
            )}

            {summary.alerts.length > 0 && (
              <Stack gap="xs" className={classes.alertsBand}>
                {summary.alerts.map((alert) => (
                  <Alert
                    key={alert.id}
                    color={alertColor(alert.severity)}
                    icon={<WarningCircle size={18} />}
                    className={classes.alertRow}
                  >
                    <Group justify="space-between" align="center" wrap="wrap" gap="sm">
                      <Text size="sm">{alert.message}</Text>
                      <Group gap="xs">
                        {alert.kind === "failed" &&
                          alert.serverId !== null &&
                          props.onOpenServerLogs !== undefined && (
                            <Button
                              size="compact-sm"
                              variant="light"
                              onClick={() => props.onOpenServerLogs?.(alert.serverId!)}
                            >
                              View logs
                            </Button>
                          )}
                        {alert.serverId !== null && (
                          <Button
                            size="compact-sm"
                            variant="default"
                            onClick={() => props.onOpenServerBackups(alert.serverId!)}
                          >
                            Open in server
                          </Button>
                        )}
                        {(alert.kind === "disk_warning" || alert.kind === "disk_critical") && (
                          <Button
                            size="compact-sm"
                            variant="light"
                            leftSection={<Broom size={14} />}
                            onClick={() => {
                              setCleanupOptions(DEFAULT_CLEANUP);
                              setCleanupPreview(null);
                              setCleanupOpen(true);
                            }}
                          >
                            Cleanup…
                          </Button>
                        )}
                      </Group>
                    </Group>
                  </Alert>
                ))}
              </Stack>
            )}

            <Group justify="space-between" align="center" wrap="wrap">
              <Title order={4}>Servers</Title>
              <Select
                aria-label="Filter servers by health"
                value={healthFilter}
                onChange={(value) => setHealthFilter((value as HealthFilter) ?? "all")}
                data={[
                  { value: "all", label: "All" },
                  { value: "protected", label: "Protected" },
                  { value: "at_risk", label: "At risk" },
                  { value: "failed", label: "Failed (24h)" },
                ]}
                w={160}
              />
            </Group>

            <Stack gap="sm">
              {filteredServers.length === 0 ? (
                <AppSurfaceCard>
                  <EmptyState
                    icon={<HardDrives size={22} />}
                    title="No matches"
                    description="No servers match this filter."
                  />
                </AppSurfaceCard>
              ) : (
                filteredServers.map((row) => {
                  const draft = drafts[row.serverId];
                  const expanded = expandedId === row.serverId;
                  const busy = busyId === row.serverId;
                  const server = serverById.get(row.serverId);
                  return (
                    <ServerHealthCard
                      key={row.serverId}
                      row={row}
                      draft={draft}
                      expanded={expanded}
                      busy={busy}
                      browsing={browsingId === row.serverId}
                      server={server}
                      onToggleExpand={() =>
                        setExpandedId(expanded ? null : row.serverId)
                      }
                      onOpenDestination={() => void openDestination(row.serverId)}
                      onOpenServer={() => props.onOpenServerBackups(row.serverId)}
                      onBrowse={() => server && void browseBackupDir(server)}
                      onDraftChange={(next) =>
                        setDrafts((previous) => ({
                          ...previous,
                          [row.serverId]: next,
                        }))
                      }
                      onSave={() => void savePolicy(row.serverId)}
                    />
                  );
                })
              )}
            </Stack>
          </>
        ) : null}
      </Stack>

      <Modal
        opened={diskModalOpen}
        onClose={() => setDiskModalOpen(false)}
        title="Disk alert thresholds"
        centered
      >
        {diskDraft !== null && (
          <Stack gap="md">
            <Text size="sm" c="dimmed">
              Alerts use volume usage for backup destinations. Warning and critical
              percentages apply to the whole drive, not only backup folders.
            </Text>
            <NumberInput
              label="Warning at used %"
              min={50}
              max={99}
              value={diskDraft.warnUsedPercent}
              onChange={(value) =>
                typeof value === "number" &&
                setDiskDraft({ ...diskDraft, warnUsedPercent: value })
              }
            />
            <NumberInput
              label="Critical at used %"
              min={51}
              max={100}
              value={diskDraft.criticalUsedPercent}
              onChange={(value) =>
                typeof value === "number" &&
                setDiskDraft({ ...diskDraft, criticalUsedPercent: value })
              }
            />
            <NumberInput
              label="Also warn if free space below (GB)"
              min={1}
              max={1024}
              value={Math.round(diskDraft.warnFreeBytes / (1024 ** 3))}
              onChange={(value) =>
                typeof value === "number" &&
                setDiskDraft({
                  ...diskDraft,
                  warnFreeBytes: value * 1024 ** 3,
                })
              }
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setDiskModalOpen(false)}>
                Cancel
              </Button>
              <Button loading={diskBusy} onClick={() => void saveDiskSettings()}>
                Save thresholds
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>

      <Modal
        opened={cleanupOpen}
        onClose={() => !cleanupBusy && setCleanupOpen(false)}
        title="Cleanup backups"
        size="lg"
        centered
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Preview what will be deleted, then confirm. The newest successful world
            backup per server is kept by default.
          </Text>
          <Checkbox
            label="Delete failed backups"
            checked={cleanupOptions.includeFailed}
            onChange={(event) =>
              setCleanupOptions((prev) => ({
                ...prev,
                includeFailed: event.currentTarget.checked,
              }))
            }
          />
          <Checkbox
            label="Enforce retain policy (delete extras beyond keep-last)"
            checked={cleanupOptions.enforceRetention}
            onChange={(event) =>
              setCleanupOptions((prev) => ({
                ...prev,
                enforceRetention: event.currentTarget.checked,
              }))
            }
          />
          <Group align="center" gap="sm">
            <Checkbox
              label="Older than"
              checked={olderThanEnabled}
              onChange={(event) => setOlderThanEnabled(event.currentTarget.checked)}
            />
            <NumberInput
              min={1}
              max={3650}
              value={olderThanDays}
              disabled={!olderThanEnabled}
              onChange={(value) =>
                typeof value === "number" && setOlderThanDays(value)
              }
              w={90}
            />
            <Text size="sm">days</Text>
          </Group>
          <Group align="center" gap="sm">
            <Checkbox
              label="Keep only last"
              checked={keepLastEnabled}
              onChange={(event) => setKeepLastEnabled(event.currentTarget.checked)}
            />
            <NumberInput
              min={1}
              max={500}
              value={keepLastPerKind}
              disabled={!keepLastEnabled}
              onChange={(value) =>
                typeof value === "number" && setKeepLastPerKind(value)
              }
              w={90}
            />
            <Text size="sm">per kind (per player for profiles)</Text>
          </Group>
          <Checkbox
            label="Protect newest successful world backup per server"
            checked={cleanupOptions.protectNewestWorld}
            onChange={(event) =>
              setCleanupOptions((prev) => ({
                ...prev,
                protectNewestWorld: event.currentTarget.checked,
              }))
            }
          />

          {cleanupPreview !== null && (
            <AppSurfaceCard tone="flat" padding="sm" radius="md" className={classes.cleanupPreview}>
              {cleanupPreview.items.length === 0 ? (
                <Text size="sm" c="dimmed">
                  Nothing matches these rules.
                </Text>
              ) : (
                <Stack gap="xs">
                  <Text size="sm" fw={600}>
                    Will delete {cleanupPreview.items.length} backup
                    {cleanupPreview.items.length === 1 ? "" : "s"} ·{" "}
                    {formatBytes(cleanupPreview.totalBytes)}
                  </Text>
                  {cleanupPreview.byServer.map((row) => (
                    <Text key={row.serverId} size="sm" c="dimmed">
                      {row.serverName}: {row.count} · {formatBytes(row.bytes)}
                    </Text>
                  ))}
                </Stack>
              )}
            </AppSurfaceCard>
          )}

          <Group justify="flex-end">
            <Button
              variant="default"
              disabled={cleanupBusy}
              onClick={() => setCleanupOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="light"
              loading={cleanupBusy}
              onClick={() => void runPreviewCleanup()}
            >
              Preview
            </Button>
            <Button
              color="red"
              loading={cleanupBusy}
              disabled={cleanupPreview === null || cleanupPreview.items.length === 0}
              onClick={() => void confirmCleanup()}
            >
              Delete {cleanupPreview?.items.length ?? 0} backups
            </Button>
          </Group>
        </Stack>
      </Modal>
    </PageScaffold>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "warning" | "danger";
  active?: boolean;
  onClick?: () => void;
}

function StatCard(props: StatCardProps): ReactElement {
  const tone = props.tone ?? "default";
  const clickable = props.onClick !== undefined;
  const className = [
    classes.statCard,
    tone === "warning" ? classes.statWarning : "",
    tone === "danger" ? classes.statDanger : "",
    props.active === true ? classes.statActive : "",
    clickable ? classes.statClickable : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (clickable) {
    return (
      <button type="button" className={className} onClick={props.onClick}>
        <Text size="xs" c="dimmed" className={classes.statLabel}>
          {props.label}
        </Text>
        <Text className={classes.statValue}>{props.value}</Text>
        {props.hint !== undefined && (
          <Text size="xs" c="dimmed" className={classes.statHint}>
            {props.hint}
          </Text>
        )}
      </button>
    );
  }

  return (
    <div className={className}>
      <Text size="xs" c="dimmed" className={classes.statLabel}>
        {props.label}
      </Text>
      <Text className={classes.statValue}>{props.value}</Text>
      {props.hint !== undefined && (
        <Text size="xs" c="dimmed" className={classes.statHint}>
          {props.hint}
        </Text>
      )}
    </div>
  );
}

interface ServerHealthCardProps {
  row: BackupServerHealth;
  draft: DraftPolicy | undefined;
  expanded: boolean;
  busy: boolean;
  browsing: boolean;
  server: ServerProfile | undefined;
  onToggleExpand: () => void;
  onOpenDestination: () => void;
  onOpenServer: () => void;
  onBrowse: () => void;
  onDraftChange: (draft: DraftPolicy) => void;
  onSave: () => void;
}

function ServerHealthCard(props: ServerHealthCardProps): ReactElement {
  const { row, draft } = props;
  return (
    <AppSurfaceCard>
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start" wrap="wrap">
          <div>
            <Group gap="xs">
              <HardDrives size={16} />
              <Title order={4}>{row.serverName}</Title>
              <Badge color={healthColor(row.health)} variant="light">
                {healthLabel(row.health)}
              </Badge>
              {row.policy.enabled ? (
                <Badge color="teal" variant="outline">
                  Schedule {row.policy.intervalMinutes}m
                </Badge>
              ) : (
                <Badge color="gray" variant="outline">
                  Schedule off
                </Badge>
              )}
            </Group>
            <Text size="sm" c="dimmed">
              Destination: {row.resolvedRoot}
            </Text>
            <Text size="xs" c="dimmed">
              Latest: {formatWhen(row.latest?.createdAt)}
              {row.latest !== null
                ? ` (${row.latest.kind} · ${row.latest.type} · ${row.latest.status})`
                : ""}
            </Text>
            <Text size="xs" c="dimmed">
              Counts — world {row.counts.world} · players {row.counts.players} · ini{" "}
              {row.counts.ini}
              {row.counts.failed24h > 0 ? ` · failed 24h ${row.counts.failed24h}` : ""}
              {" · "}
              used {formatBytes(row.usedBytes)}
            </Text>
          </div>
          <Group gap="xs">
            <Button
              variant="subtle"
              leftSection={<FolderOpen size={16} />}
              onClick={props.onOpenDestination}
              disabled={props.busy}
            >
              Open destination
            </Button>
            <Button
              variant="light"
              leftSection={<ArrowSquareOut size={16} />}
              onClick={props.onOpenServer}
            >
              Open in server
            </Button>
            <Button variant="default" onClick={props.onToggleExpand}>
              {props.expanded ? "Hide settings" : "Edit settings"}
            </Button>
          </Group>
        </Group>

        {props.expanded && draft !== undefined && (
          <Stack gap="sm">
            <Text size="sm" c="dimmed">
              Destination and schedule apply to <strong>world</strong> backups.
              Players and INI use the same root but their own triggers and retain
              counts.
            </Text>
            <Group align="flex-end" gap="sm" wrap="nowrap">
              <TextInput
                className={classes.dirField}
                label="Backup destination"
                description={
                  draft.backupDir === null || draft.backupDir.length === 0
                    ? `Default: ${props.server?.installDir ?? ""}\\Backups`
                    : `Effective: ${row.resolvedRoot}`
                }
                value={draft.backupDir ?? ""}
                placeholder={`${props.server?.installDir ?? ""}\\Backups`}
                onChange={(event) =>
                  props.onDraftChange({
                    ...draft,
                    backupDir:
                      event.currentTarget.value.trim().length > 0
                        ? event.currentTarget.value
                        : null,
                  })
                }
              />
              <Button
                variant="default"
                loading={props.browsing}
                onClick={props.onBrowse}
              >
                Browse
              </Button>
            </Group>
            <Group align="flex-end" gap="md" wrap="wrap">
              <Switch
                label="Enable scheduled world backups"
                checked={draft.enabled}
                onChange={(event) =>
                  props.onDraftChange({
                    ...draft,
                    enabled: event.currentTarget.checked,
                  })
                }
              />
              <NumberInput
                label="Interval (minutes)"
                description="Min 5 · default 60 · world only"
                min={5}
                max={10_080}
                value={draft.intervalMinutes}
                onChange={(value) =>
                  props.onDraftChange({
                    ...draft,
                    intervalMinutes:
                      typeof value === "number" ? value : draft.intervalMinutes,
                  })
                }
                className={classes.policyField}
              />
              <NumberInput
                label="Keep last world"
                min={1}
                max={500}
                value={draft.retainCountWorld}
                onChange={(value) =>
                  props.onDraftChange({
                    ...draft,
                    retainCountWorld:
                      typeof value === "number" ? value : draft.retainCountWorld,
                  })
                }
                className={classes.policyField}
              />
              <NumberInput
                label="Keep last players"
                description="Per player"
                min={1}
                max={500}
                value={draft.retainCountPlayers}
                onChange={(value) =>
                  props.onDraftChange({
                    ...draft,
                    retainCountPlayers:
                      typeof value === "number" ? value : draft.retainCountPlayers,
                  })
                }
                className={classes.policyField}
              />
              <NumberInput
                label="Keep last INI"
                min={1}
                max={500}
                value={draft.retainCountIni}
                onChange={(value) =>
                  props.onDraftChange({
                    ...draft,
                    retainCountIni:
                      typeof value === "number" ? value : draft.retainCountIni,
                  })
                }
                className={classes.policyField}
              />
              <Button
                leftSection={<FloppyDisk size={16} />}
                loading={props.busy}
                onClick={props.onSave}
              >
                Save
              </Button>
            </Group>
          </Stack>
        )}
      </Stack>
    </AppSurfaceCard>
  );
}
