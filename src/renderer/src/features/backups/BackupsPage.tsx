import type { ReactElement } from "react";
import {
  ArrowSquareOut,
  FloppyDisk,
  FolderOpen,
  HardDrives,
} from "@phosphor-icons/react";
import {
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
  Title,
  Tooltip,
} from "@mantine/core";
import { PageScaffold } from "@layout/PageScaffold/PageScaffold";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";
import { EmptyState } from "@ui/EmptyState/EmptyState";
import { showOperatorError, showOperatorToast } from "@ui/operatorToast";
import { PathField } from "@ui/PathField/PathField";
import { ReadonlyPath } from "@ui/ReadonlyPath/ReadonlyPath";
import { formatLogDateTime } from "@shared/format-log-datetime";
import type {
  BackupCleanupOptions,
  BackupCleanupPreview,
  BackupDiskAlertSettings,
  BackupFleetSummary,
  BackupHealthStatus,
  BackupServerHealth,
  ServerProfile,
} from "@shared/types";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  isBackupDiskDraftDirty,
  isBackupPolicyDraftDirty,
  toBackupPolicyDraft,
  type BackupPolicyDraft,
} from "./backupPolicyDraft";
import {
  BackupFleetAlertsPanel,
  type OpenFailedBackupLogsArgs,
} from "./components/BackupFleetAlertsPanel/BackupFleetAlertsPanel";
import { BackupFleetMetrics } from "./components/BackupFleetMetrics/BackupFleetMetrics";
import classes from "./BackupsPage.module.css";

interface Props {
  servers: ServerProfile[];
  onOpenServerBackups: (serverId: string) => void;
  onOpenFailedBackupLogs?: (args: OpenFailedBackupLogsArgs) => void;
}

type DraftPolicy = BackupPolicyDraft;
type HealthFilter = "all" | "at_risk" | "failed" | "protected";

function formatWhen(iso: string | null | undefined): string {
  return formatLogDateTime(iso);
}

function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return "–";
  const abs = Math.abs(bytes);
  if (abs >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (abs >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (abs >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${Math.round(bytes)} B`;
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

function healthTooltip(health: BackupHealthStatus): string {
  if (health === "ok") {
    return "This server has a completed world backup and is not overdue for its schedule.";
  }
  if (health === "warning") {
    return "Backup protection needs attention – for example the world schedule is on with no world backup yet, the last world backup is overdue, or a recent backup failed.";
  }
  if (health === "critical") {
    return "World backups cannot protect this server right now – the backup folder is missing or a world backup failed in the last 24 hours.";
  }
  return "No completed world backup yet. Either the world schedule is off, or it is on but this server is not running so a scheduled backup cannot run yet. Start the server or create a manual world backup.";
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

  const loadGenerationRef = useRef(0);
  const load = async (opts?: {
    quiet?: boolean;
    /** Replace local drafts from server (Refresh). Default merges and keeps dirty edits. */
    forceDraftSync?: boolean;
    cancelled?: () => boolean;
  }) => {
    const quiet = opts?.quiet === true;
    const forceDraftSync = opts?.forceDraftSync === true;
    const cancelled = opts?.cancelled;
    // Non-quiet loads bump the generation. Quiet loads snapshot it so a slow
    // onBackupsChanged update no-ops if a newer Refresh starts mid-flight.
    const generation = quiet
      ? loadGenerationRef.current
      : ++loadGenerationRef.current;
    if (!quiet) {
      setLoading(true);
    }
    try {
      if (props.servers.length === 0) {
        if (cancelled?.()) return;
        if (generation !== loadGenerationRef.current) return;
        setSummary(null);
        setDrafts({});
        return;
      }

      const result = await window.api.getBackupFleetSummary();
      if (cancelled?.()) return;
      if (generation !== loadGenerationRef.current) return;
      if (!result.ok) {
        setSummary(null);
        showOperatorError(
          result.error ?? "Could not load backup summary",
          "Could not load backups",
        );
        return;
      }

      setSummary(result.data);
      // Quiet refresh must not clobber in-progress policy edits.
      // Non-quiet also keeps dirty drafts unless Refresh forces a sync (poll must not wipe toggles).
      if (!quiet) {
        setDrafts((previous) => {
          const nextDrafts: Record<string, DraftPolicy> = {};
          for (const row of result.data.servers) {
            const existing = previous[row.serverId];
            if (
              !forceDraftSync &&
              existing !== undefined &&
              isBackupPolicyDraftDirty(existing, row.policy)
            ) {
              nextDrafts[row.serverId] = existing;
            } else {
              nextDrafts[row.serverId] = toBackupPolicyDraft(row.policy);
            }
          }
          return nextDrafts;
        });
        setDiskDraft((previous) => {
          if (
            !forceDraftSync &&
            previous !== null &&
            isBackupDiskDraftDirty(previous, result.data.diskSettings)
          ) {
            return previous;
          }
          return result.data.diskSettings;
        });
      }
    } finally {
      // Quiet updates never own the spinner; only the latest non-quiet load clears it.
      if (!quiet && generation === loadGenerationRef.current) {
        setLoading(false);
      }
    }
  };

  // Reload when the server set changes. Live backup updates use onBackupsChanged;
  // App no longer heartbeats listServers off the Servers list.
  const serverIdsKey = useMemo(
    () => props.servers.map((server) => server.id).join("\0"),
    [props.servers],
  );

  useEffect(() => {
    let cancelled = false;
    void load({ cancelled: () => cancelled });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: serverIdsKey, not servers ref
  }, [serverIdsKey]);

  useEffect(() => {
    if (typeof window.api.onBackupsChanged !== "function") return undefined;
    return window.api.onBackupsChanged(() => {
      void load({ quiet: true });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- subscribe once per server set
  }, [serverIdsKey]);

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

  // Quiet = no files, no risk, no enabled schedules. `protectedCount` is
  // fleet health === "ok", not "a policy row exists".
  const backupFleetQuiet =
    summary !== null &&
    summary.stats.totalBackupBytes === 0 &&
    summary.stats.failed24h === 0 &&
    summary.stats.atRiskCount === 0 &&
    summary.stats.protectedCount === 0 &&
    summary.servers.every((row) => !row.policy.enabled);

  const savePolicy = async (serverId: string) => {
    const draft = drafts[serverId];
    if (draft === undefined) return;
    setBusyId(serverId);
    try {
      const result = await window.api.setBackupPolicy(serverId, draft);
      if (!result.ok) {
        showOperatorError(
          result.error ?? "Could not save backup policy",
          "Could not save backup settings",
        );
        return;
      }
      // Toast before refresh so a failed reload cannot precede a success message.
      showOperatorToast({
        title: "Saved",
        message: "Saved backup settings for the selected server.",
      });
      await load({ quiet: true });
    } finally {
      setBusyId(null);
    }
  };

  const browseBackupDir = async (server: ServerProfile) => {
    const draft = drafts[server.id];
    if (draft === undefined) return;
    setBrowsingId(server.id);
    try {
      const result = await window.api.pickPath(
        "directory",
        draft.backupDir ?? server.installDir,
        `Backup destination for ${server.name}`,
      );
      if (!result.ok) {
        showOperatorError(result.error ?? "Could not open folder picker");
        return;
      }
      if (result.data !== null) {
        setDrafts((previous) => ({
          ...previous,
          [server.id]: { ...draft, backupDir: result.data },
        }));
      }
    } finally {
      setBrowsingId(null);
    }
  };

  const openDestination = async (serverId: string) => {
    setBusyId(serverId);
    try {
      const result = await window.api.openBackupRoot(serverId);
      if (!result.ok) {
        showOperatorError(result.error ?? "Could not open backup destination");
      }
    } finally {
      setBusyId(null);
    }
  };

  const saveDiskSettings = async () => {
    if (diskDraft === null) return;
    setDiskBusy(true);
    try {
      const result = await window.api.setBackupDiskAlertSettings(diskDraft);
      if (!result.ok) {
        showOperatorError(
          result.error ?? "Could not save disk alert settings",
          "Could not save drive alerts",
        );
        return;
      }
      setDiskModalOpen(false);
      showOperatorToast({
        title: "Saved",
        message: "Backup drive alerts updated.",
      });
      await load();
    } finally {
      setDiskBusy(false);
    }
  };

  const dismissFleetAlert = async (alert: {
    id: string;
    fingerprint: string;
  }) => {
    const result = await window.api.dismissBackupFleetAlert(
      alert.id,
      alert.fingerprint,
    );
    if (!result.ok) {
      showOperatorError(result.error ?? "Could not dismiss alert");
      return;
    }
    await load({ quiet: true });
  };

  const buildCleanupPayload = (): BackupCleanupOptions => ({
    ...cleanupOptions,
    olderThanDays: olderThanEnabled ? olderThanDays : null,
    keepLastPerKind: keepLastEnabled ? keepLastPerKind : null,
  });

  const runPreviewCleanup = async () => {
    setCleanupBusy(true);
    try {
      const result = await window.api.previewBackupCleanup(buildCleanupPayload());
      if (!result.ok) {
        setCleanupPreview(null);
        showOperatorError(result.error ?? "Could not preview cleanup");
        return;
      }
      setCleanupPreview(result.data);
    } finally {
      setCleanupBusy(false);
    }
  };

  const confirmCleanup = async () => {
    if (cleanupPreview === null || cleanupPreview.items.length === 0) return;
    setCleanupBusy(true);
    try {
      const result = await window.api.runBackupCleanup({
        ...buildCleanupPayload(),
        confirmedBackupIds: cleanupPreview.items.map((item) => item.backup.id),
      });
      if (!result.ok) {
        showOperatorError(result.error ?? "Could not run cleanup");
        return;
      }
      setCleanupOpen(false);
      setCleanupPreview(null);
      showOperatorToast({
        title: "Cleanup finished",
        message: `Cleanup removed ${result.data.deleted} backup${result.data.deleted === 1 ? "" : "s"} (${formatBytes(result.data.freedBytes)}).`,
      });
      await load();
    } finally {
      setCleanupBusy(false);
    }
  };

  const serverById = useMemo(() => {
    const map = new Map(props.servers.map((server) => [server.id, server]));
    return map;
  }, [props.servers]);

  return (
    <PageScaffold
      title="Backups"
      fillViewport
      actions={
        <Group gap="sm">
          <Button
            variant="default"
            onClick={() => void load({ forceDraftSync: true })}
            loading={loading}
          >
            Refresh
          </Button>
          <Button
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
            <BackupFleetAlertsPanel
              alerts={summary.alerts}
              onOpenServerBackups={props.onOpenServerBackups}
              onOpenFailedBackupLogs={props.onOpenFailedBackupLogs}
              onDismissAlert={(alert) => void dismissFleetAlert(alert)}
              onOpenCleanup={() => {
                setCleanupOptions(DEFAULT_CLEANUP);
                setCleanupPreview(null);
                setCleanupOpen(true);
              }}
            />

            <BackupFleetMetrics
              summary={summary}
              quiet={backupFleetQuiet}
              healthFilter={healthFilter}
              onHealthFilter={setHealthFilter}
              onOpenDiskSettings={() => {
                setDiskDraft(summary.diskSettings);
                setDiskModalOpen(true);
              }}
            />

            {summary.disks.length > 0 && !backupFleetQuiet && (
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
        title="Warn me when the backup drive fills up"
        centered
      >
        {diskDraft !== null && (
          <Stack gap="md">
            <Text size="sm" c="dimmed">
              Based on the whole drive, not just the backup folder. Warning and
              critical percentages apply to total used space.
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
            Finds backups that match your rules. The newest successful world
            backup per server is kept by default.
          </Text>
          <Checkbox
            label="Delete failed backups"
            checked={cleanupOptions.includeFailed}
            onChange={(event) => {
              setCleanupPreview(null);
              setCleanupOptions((prev) => ({
                ...prev,
                includeFailed: event.currentTarget.checked,
              }));
            }}
          />
          <Checkbox
            label="Delete older backups past each server's keep limit"
            checked={cleanupOptions.enforceRetention}
            onChange={(event) => {
              setCleanupPreview(null);
              setCleanupOptions((prev) => ({
                ...prev,
                enforceRetention: event.currentTarget.checked,
              }));
            }}
          />
          <Group align="center" gap="sm">
            <Checkbox
              label="Older than"
              checked={olderThanEnabled}
              onChange={(event) => {
                setCleanupPreview(null);
                setOlderThanEnabled(event.currentTarget.checked);
              }}
            />
            <NumberInput
              min={1}
              max={3650}
              value={olderThanDays}
              disabled={!olderThanEnabled}
              onChange={(value) => {
                if (typeof value === "number") {
                  setCleanupPreview(null);
                  setOlderThanDays(value);
                }
              }}
              w={90}
            />
            <Text size="sm">days</Text>
          </Group>
          <Group align="center" gap="sm">
            <Checkbox
              label="Keep only last"
              checked={keepLastEnabled}
              onChange={(event) => {
                setCleanupPreview(null);
                setKeepLastEnabled(event.currentTarget.checked);
              }}
            />
            <NumberInput
              min={1}
              max={500}
              value={keepLastPerKind}
              disabled={!keepLastEnabled}
              onChange={(value) => {
                if (typeof value === "number") {
                  setCleanupPreview(null);
                  setKeepLastPerKind(value);
                }
              }}
              w={90}
            />
            <Text size="sm">per kind (per player for profiles)</Text>
          </Group>
          <Checkbox
            label="Protect newest successful world backup per server"
            checked={cleanupOptions.protectNewestWorld}
            onChange={(event) => {
              setCleanupPreview(null);
              setCleanupOptions((prev) => ({
                ...prev,
                protectNewestWorld: event.currentTarget.checked,
              }));
            }}
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
            {cleanupPreview !== null && cleanupPreview.items.length > 0 ? (
              <Button
                color="red"
                variant="filled"
                loading={cleanupBusy}
                onClick={() => void confirmCleanup()}
              >
                Remove {cleanupPreview.items.length}
              </Button>
            ) : (
              <Button
                variant="light"
                loading={cleanupBusy}
                onClick={() => void runPreviewCleanup()}
              >
                Scan
              </Button>
            )}
          </Group>
        </Stack>
      </Modal>
    </PageScaffold>
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
              {props.server?.enabled === false && (
                <Badge size="xs" color="gray" variant="light">
                  Inactive
                </Badge>
              )}
              <Tooltip label={healthTooltip(row.health)} multiline maw={320} withArrow>
                <Badge color={healthColor(row.health)} variant="light">
                  {healthLabel(row.health)}
                </Badge>
              </Tooltip>
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
            <Text size="sm" c="dimmed" mb={4}>
              Destination
            </Text>
            <ReadonlyPath value={row.resolvedRoot} compact />
            <Text size="xs" c="dimmed">
              Latest: {formatWhen(row.latest?.createdAt)}
              {row.latest !== null
                ? ` (${row.latest.kind} · ${row.latest.type} · ${row.latest.status})`
                : ""}
            </Text>
            <Text size="xs" c="dimmed">
              Counts – world {row.counts.world} · players {row.counts.players} · ini{" "}
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
            <PathField
              className={classes.dirField}
              label="Backup destination"
              description={
                draft.backupDir === null || draft.backupDir.length === 0
                  ? `Default: ${props.server?.installDir ?? ""}\\Backups`
                  : `Effective: ${row.resolvedRoot}`
              }
              value={draft.backupDir ?? ""}
              placeholder={`${props.server?.installDir ?? ""}\\Backups`}
              busy={props.browsing}
              clearable
              onChange={(value) =>
                props.onDraftChange({
                  ...draft,
                  backupDir: value.trim().length > 0 ? value : null,
                })
              }
              onBrowse={props.onBrowse}
            />
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
