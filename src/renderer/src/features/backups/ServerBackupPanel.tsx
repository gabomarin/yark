import type { ReactElement } from "react";
import {
  ArrowClockwise,
  CaretDown,
  CaretRight,
  FolderOpen,
  HardDrives,
  MagnifyingGlass,
  Trash,
  UploadSimple,
} from "@phosphor-icons/react";
import {
  Alert,
  ActionIcon,
  Badge,
  Button,
  Checkbox,
  Group,
  NumberInput,
  Select,
  Stack,
  Switch,
  Tabs,
  Text,
  TextInput,
  Title,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { backupFinishedAt, playerBackupDisplayName } from "@shared/backup-player-meta";
import { formatLogDateTime } from "@shared/format-log-datetime";
import { isInstallationReady } from "@shared/installation-health";
import type {
  BackupKind,
  BackupPolicy,
  BackupRecord,
  ServerInstallationInfo,
  ServerProfile,
  ServerRuntimeInfo,
} from "@shared/types";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";
import { EmptyState } from "@ui/EmptyState/EmptyState";
import { PathField } from "@ui/PathField/PathField";
import { BackupHistoryRowActions } from "./BackupHistoryRowActions";
import { runBackupExport, runBackupImport } from "./backupPortability";
import { formatBackupDetails } from "./formatBackupDetails";
import classes from "./BackupsPage.module.css";

interface Props {
  server: ServerProfile;
  runtime: ServerRuntimeInfo | null;
  /** Install probe — create/restore require Ready. */
  installation?: ServerInstallationInfo | null;
  /** Compact layout for workspace tab (no outer page chrome). */
  embedded?: boolean;
  /** Running server or SteamCMD files job — blocks restore (like server active). */
  opsLocked?: boolean;
  opsLockReason?: string;
  /** Another backup owns this server's archive pipeline. */
  createLocked?: boolean;
  createLockReason?: string;
}

type BusyOp = "create" | "import" | "export" | "other";
type DraftPolicy = Omit<BackupPolicy, "serverId" | "updatedAt">;
type PlayerSort = "newest" | "oldest" | "name-asc" | "name-desc";

const KIND_TABS: Array<{ kind: BackupKind; label: string }> = [
  { kind: "world", label: "World save" },
  { kind: "players", label: "Player profiles" },
  { kind: "ini", label: "INI" },
];

const PLAYER_SORT_OPTIONS: Array<{ value: PlayerSort; label: string }> = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "name-asc", label: "Player A–Z" },
  { value: "name-desc", label: "Player Z–A" },
];

const TOAST_POSITION = "bottom-right" as const;

function formatSize(sizeBytes: number): string {
  if (sizeBytes <= 0) return "—";
  if (sizeBytes >= 1024 * 1024) {
    return `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  return `${(sizeBytes / 1024).toFixed(1)} KB`;
}

function formatWhen(iso: string): string {
  return formatLogDateTime(iso, { fallback: iso });
}

function archiveFileName(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/");
  const name = parts[parts.length - 1] ?? "";
  return name.length > 0 ? name : path;
}

const relativeTimeFormat = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

function formatRelativeTime(iso: string, nowMs = Date.now()): string {
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

function statusColor(status: BackupRecord["status"]): string {
  if (status === "completed") return "green";
  if (status === "failed") return "red";
  return "yellow";
}

function kindLabel(kind: BackupKind): string {
  return KIND_TABS.find((tab) => tab.kind === kind)?.label ?? "World save";
}

function isServerActive(runtime: ServerRuntimeInfo | null | undefined): boolean {
  const status = runtime?.status ?? "stopped";
  return status === "running" || status === "starting" || status === "stopping";
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

function showBackupToast(
  message: string,
  options?: { color?: string; title?: string; autoClose?: number | false },
): void {
  notifications.show({
    title: options?.title ?? "Backups",
    message,
    color: options?.color ?? "teal",
    position: TOAST_POSITION,
    autoClose: options?.autoClose ?? 5000,
    withCloseButton: true,
  });
}

function showBackupError(message: string): void {
  showBackupToast(message, { color: "red", autoClose: 8000 });
}

function compareByFinishedAt(a: BackupRecord, b: BackupRecord, newestFirst: boolean): number {
  const diff =
    new Date(backupFinishedAt(a)).getTime() - new Date(backupFinishedAt(b)).getTime();
  return newestFirst ? -diff : diff;
}

function sortPlayerBackups(backups: BackupRecord[], sort: PlayerSort): BackupRecord[] {
  const next = [...backups];
  next.sort((a, b) => {
    if (sort === "newest") return compareByFinishedAt(a, b, true);
    if (sort === "oldest") return compareByFinishedAt(a, b, false);
    const nameA = playerBackupDisplayName(a).toLocaleLowerCase();
    const nameB = playerBackupDisplayName(b).toLocaleLowerCase();
    const byName = nameA.localeCompare(nameB);
    if (byName !== 0) return sort === "name-asc" ? byName : -byName;
    return compareByFinishedAt(a, b, true);
  });
  return next;
}

function worldPolicySummary(
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

function playersPolicySummary(draft: DraftPolicy): string {
  return `Keep last ${draft.retainCountPlayers} per player`;
}

function iniPolicySummary(draft: DraftPolicy): string {
  return `Keep last ${draft.retainCountIni}`;
}

function draftEqualsPolicy(draft: DraftPolicy, policy: BackupPolicy): boolean {
  return (
    draft.enabled === policy.enabled
    && draft.intervalMinutes === policy.intervalMinutes
    && draft.retainCountWorld === policy.retainCountWorld
    && draft.retainCountPlayers === policy.retainCountPlayers
    && draft.retainCountIni === policy.retainCountIni
    && draft.backupDir === policy.backupDir
  );
}

function draftEqualsDraft(a: DraftPolicy, b: DraftPolicy): boolean {
  return (
    a.enabled === b.enabled
    && a.intervalMinutes === b.intervalMinutes
    && a.retainCountWorld === b.retainCountWorld
    && a.retainCountPlayers === b.retainCountPlayers
    && a.retainCountIni === b.retainCountIni
    && a.backupDir === b.backupDir
  );
}

const POLICY_AUTOSAVE_MS = 450;

export function ServerBackupPanel(props: Props): ReactElement {
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [policy, setPolicy] = useState<BackupPolicy | null>(null);
  const [draftPolicy, setDraftPolicy] = useState<DraftPolicy | null>(null);
  const [activeKind, setActiveKind] = useState<BackupKind>("world");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [resolvedRoot, setResolvedRoot] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busyOp, setBusyOp] = useState<BusyOp | null>(null);
  const [browsingDir, setBrowsingDir] = useState(false);
  const [playerSearch, setPlayerSearch] = useState("");
  const [playerSort, setPlayerSort] = useState<PlayerSort>("newest");
  const [settingsOpen, setSettingsOpen] = useState(true);
  const loadGenRef = useRef(0);
  const saveGenRef = useRef(0);

  const serverActive = isServerActive(props.runtime);
  const busy = busyOp !== null;
  // Omitted prop (undefined) keeps prior behavior for isolated callers/tests.
  // Explicit null / non-ready health locks create and restore.
  const installReady =
    props.installation === undefined
      ? true
      : isInstallationReady(props.installation);
  const installLockReason =
    props.installation?.guidance?.trim()
    || "Install server files before creating or restoring backups.";
  const createBlocked = props.createLocked === true || !installReady;
  const createBlockReason = !installReady
    ? installLockReason
    : (props.createLockReason ?? "Wait for the active backup to finish");
  const restoreLocked = props.opsLocked === true || serverActive || !installReady;
  const restoreLockReason = !installReady
    ? installLockReason
    : props.opsLockReason
      ?? (serverActive ? "Stop the server before restoring a backup." : undefined);
  const opsLocked = restoreLocked;
  const opsLockReason = restoreLockReason;
  const defaultBackupHint = `${props.server.installDir}\\Backups`;
  const activeKindLabel = kindLabel(activeKind);
  const kindBackups = useMemo(
    () => backups.filter((backup) => backup.kind === activeKind),
    [backups, activeKind],
  );

  const displayedBackups = useMemo(() => {
    if (activeKind !== "players") return kindBackups;
    const query = playerSearch.trim().toLocaleLowerCase();
    const filtered =
      query.length === 0
        ? kindBackups
        : kindBackups.filter((backup) =>
            playerBackupDisplayName(backup).toLocaleLowerCase().includes(query),
          );
    return sortPlayerBackups(filtered, playerSort);
  }, [activeKind, kindBackups, playerSearch, playerSort]);

  const selectableBackups = displayedBackups.filter((b) => b.status !== "running");
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allSelected =
    selectableBackups.length > 0
    && selectableBackups.every((b) => selectedIdSet.has(b.id));

  const load = async (serverId: string, opts?: { quiet?: boolean }) => {
    const quiet = opts?.quiet === true;
    const gen = ++loadGenRef.current;
    if (!quiet) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    try {
      const [listRes, policyRes, rootRes] = await Promise.all([
        window.api.listBackups(serverId, 100),
        window.api.getBackupPolicy(serverId),
        window.api.resolveBackupRoot(serverId),
      ]);
      // Drop stale responses so overlapping interval/push/user loads cannot regress UI.
      if (gen !== loadGenRef.current) return;
      if (!listRes.ok) {
        if (!quiet) {
          setBackups([]);
          setPolicy(null);
          setDraftPolicy(null);
          setResolvedRoot(null);
          setSelectedIds([]);
        }
        showBackupError(listRes.error ?? "Could not load backups");
        return;
      }
      if (!policyRes.ok) {
        setBackups(listRes.data);
        if (!quiet) {
          setPolicy(null);
          setDraftPolicy(null);
          setResolvedRoot(null);
          setSelectedIds([]);
        }
        showBackupError(policyRes.error ?? "Could not load backup policy");
        return;
      }
      setBackups(listRes.data);
      setSelectedIds((prev) =>
        prev.filter((id) =>
          listRes.data.some((b) => b.id === id && b.status !== "running"),
        ),
      );
      setPolicy(policyRes.data);
      // Quiet refresh must not clobber unsaved destination/schedule/retention edits.
      if (!quiet) {
        setDraftPolicy(toDraft(policyRes.data));
      }
      setResolvedRoot(rootRes.ok ? rootRes.data : null);
    } finally {
      if (gen === loadGenRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  useEffect(() => {
    void load(props.server.id);
  }, [props.server.id, props.server.updatedAt]);

  // Auto-refresh while the panel is open (picks up join/leave archives).
  useEffect(() => {
    const timer = window.setInterval(() => {
      void load(props.server.id, { quiet: true });
    }, 12_000);
    return () => window.clearInterval(timer);
  }, [props.server.id]);

  useEffect(() => {
    if (typeof window.api.onBackupsChanged !== "function") return undefined;
    return window.api.onBackupsChanged((payload) => {
      if (payload.serverId !== props.server.id) return;
      void load(props.server.id, { quiet: true });
    });
  }, [props.server.id]);

  // Autosave policy edits (debounced). Errors toast; success is silent.
  useEffect(() => {
    if (draftPolicy === null || policy === null) return;
    if (draftEqualsPolicy(draftPolicy, policy)) return;
    const snapshot = draftPolicy;
    const serverId = props.server.id;
    const timer = window.setTimeout(() => {
      void (async () => {
        const gen = ++saveGenRef.current;
        const result = await window.api.setBackupPolicy(serverId, snapshot);
        if (gen !== saveGenRef.current) return;
        if (!result.ok) {
          showBackupError(result.error ?? "Could not save backup policy");
          return;
        }
        setPolicy(result.data);
        setDraftPolicy((current) => {
          if (current === null) return toDraft(result.data);
          return draftEqualsDraft(current, snapshot) ? toDraft(result.data) : current;
        });
        const rootRes = await window.api.resolveBackupRoot(serverId);
        if (gen !== saveGenRef.current) return;
        if (rootRes.ok) setResolvedRoot(rootRes.data);
      })();
    }, POLICY_AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
  }, [draftPolicy, policy, props.server.id]);

  const forceRefresh = async () => {
    await load(props.server.id, { quiet: true });
    showBackupToast("Backup list refreshed.");
  };

  const selectKind = (kind: BackupKind) => {
    setActiveKind(kind);
    setSelectedIds([]);
    setSettingsOpen(true);
  };

  const createBackup = async () => {
    setBusyOp("create");
    try {
      const result = await window.api.createManualBackup(props.server.id, [activeKind]);
      if (!result.ok) {
        showBackupError(result.error ?? "Could not create backup");
        return;
      }
      await load(props.server.id);
      showBackupToast(
        activeKind === "players"
          ? "Full player-profiles snapshot completed."
          : `${activeKindLabel} backup completed.`,
      );
    } finally {
      setBusyOp(null);
    }
  };

  const browseBackupDir = async () => {
    if (draftPolicy === null) return;
    setBrowsingDir(true);
    try {
      const result = await window.api.pickPath(
        "directory",
        draftPolicy.backupDir ?? props.server.installDir,
        "Choose backup destination",
      );
      if (!result.ok) {
        showBackupError(result.error ?? "Could not open folder picker");
        return;
      }
      if (result.data !== null) {
        setDraftPolicy({ ...draftPolicy, backupDir: result.data });
      }
    } finally {
      setBrowsingDir(false);
    }
  };

  const openDestination = async () => {
    setBusyOp("other");
    try {
      const result = await window.api.openBackupRoot(props.server.id);
      if (!result.ok) {
        showBackupError(result.error ?? "Could not open backup destination");
      }
    } finally {
      setBusyOp(null);
    }
  };

  const openBackupFolder = async (backupId: string) => {
    setBusyOp("other");
    try {
      const result = await window.api.openBackupFolder(props.server.id, backupId);
      if (!result.ok) {
        showBackupError(result.error ?? "Could not open backup folder");
      }
    } finally {
      setBusyOp(null);
    }
  };

  const exportBackup = async (backup: BackupRecord) => {
    setBusyOp("export");
    try {
      await runBackupExport({
        serverId: props.server.id,
        serverName: props.server.name,
        backup,
        onError: showBackupError,
        onSuccess: (path) => showBackupToast(`Exported to ${path}`),
      });
    } finally {
      setBusyOp(null);
    }
  };

  const importBackup = async () => {
    setBusyOp("import");
    try {
      await runBackupImport({
        serverId: props.server.id,
        kind: activeKind,
        kindLabel: activeKindLabel,
        onError: showBackupError,
        onSuccess: async () => {
          await load(props.server.id);
          showBackupToast(
            `Imported ${activeKindLabel.toLowerCase()} archive into backup history (not restored).`,
          );
        },
      });
    } finally {
      setBusyOp(null);
    }
  };

  const toggleSelected = (backupId: string) => {
    setSelectedIds((prev) =>
      prev.includes(backupId)
        ? prev.filter((id) => id !== backupId)
        : [...prev, backupId],
    );
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(selectableBackups.map((b) => b.id));
  };

  const deleteBackupsByIds = async (backupIds: string[]) => {
    setBusyOp("other");
    try {
      const result = await window.api.deleteBackups(props.server.id, backupIds);
      if (!result.ok) {
        showBackupError(result.error ?? "Could not delete backups");
        return;
      }
      setSelectedIds((prev) => prev.filter((id) => !backupIds.includes(id)));
      await load(props.server.id);
      showBackupToast(
        `Deleted ${result.data} backup${result.data === 1 ? "" : "s"}.`,
      );
    } finally {
      setBusyOp(null);
    }
  };

  const confirmDeleteSelected = () => {
    if (selectedIds.length === 0) return;
    const count = selectedIds.length;
    modals.openConfirmModal({
      title: `Delete selected ${activeKindLabel.toLowerCase()} backups?`,
      children: (
        <Text size="sm">
          Permanently delete <strong>{count}</strong> {activeKindLabel.toLowerCase()}{" "}
          backup{count === 1 ? "" : "s"} from disk and the database? This cannot be undone.
        </Text>
      ),
      labels: { confirm: "Delete", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: () => {
        void deleteBackupsByIds(selectedIds);
      },
    });
  };

  const confirmDeleteOne = (backup: BackupRecord) => {
    if (backup.status === "running") return;
    const label =
      backup.kind === "players" ? playerBackupDisplayName(backup) : activeKindLabel;
    modals.openConfirmModal({
      title: `Delete ${label.toLowerCase()} backup?`,
      children: (
        <Text size="sm">
          Permanently delete this <strong>{label}</strong> backup from disk and the
          database? This cannot be undone.
        </Text>
      ),
      labels: { confirm: "Delete", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: () => {
        void deleteBackupsByIds([backup.id]);
      },
    });
  };

  const copyBackupDetails = async (backup: BackupRecord) => {
    const payload = formatBackupDetails(
      { id: props.server.id, name: props.server.name },
      backup,
    );
    try {
      await navigator.clipboard.writeText(payload);
      showBackupToast("Backup details copied.");
    } catch (error) {
      showBackupError(
        error instanceof Error ? error.message : "Could not copy backup details",
      );
    }
  };

  const confirmRestore = (backup: BackupRecord) => {
    if (opsLocked) {
      showBackupError(
        opsLockReason ?? "Stop the server before restoring a backup.",
      );
      return;
    }
    const label = kindLabel(backup.kind);
    modals.openConfirmModal({
      title: "Restore backup?",
      children: (
        <Text size="sm">
          Restore <strong>{label}</strong> from{" "}
          {formatWhen(backupFinishedAt(backup))} onto{" "}
          <strong>{props.server.name}</strong>? Only that kind of data is replaced.
          A safety backup of the same kind is created first. The server must stay stopped.
        </Text>
      ),
      labels: { confirm: "Restore", cancel: "Cancel" },
      confirmProps: { color: "orange" },
      onConfirm: () => {
        void (async () => {
          setBusyOp("other");
          try {
            const result = await window.api.restoreBackup(props.server.id, backup.id);
            if (!result.ok) {
              showBackupError(result.error ?? "Could not restore backup");
              return;
            }
            await load(props.server.id);
            showBackupToast(
              `${label} backup restored. A pre-restore safety copy was kept.`,
            );
          } finally {
            setBusyOp(null);
          }
        })();
      },
    });
  };

  const emptyHint =
    activeKind === "world"
      ? "No world backups yet. Create one manually or enable the world schedule."
      : activeKind === "players"
        ? playerSearch.trim().length > 0
          ? "No player backups match this search."
          : "No player profile backups yet. Backup all players now, or they'll be saved automatically when players join or leave."
        : "No INI backups yet. Create one manually — an automatic copy is also taken after each successful INI save.";

  const settingsTitle =
    activeKind === "world"
      ? "World destination & schedule"
      : activeKind === "players"
        ? "Player retention"
        : "INI retention";

  const settingsSummary =
    draftPolicy === null
      ? null
      : activeKind === "world"
        ? worldPolicySummary(draftPolicy, resolvedRoot, defaultBackupHint)
        : activeKind === "players"
          ? playersPolicySummary(draftPolicy)
          : iniPolicySummary(draftPolicy);

  const createLabel = activeKind === "players" ? "Backup all players" : "Backup";
  const createTooltip = createBlocked
    ? createBlockReason
    : activeKind === "world"
      ? "Create a manual world save backup now"
      : activeKind === "players"
        ? "Create a full snapshot of all player profiles"
        : "Create a manual backup of Game.ini and GameUserSettings.ini";
  const deleteTooltip =
    selectedIds.length === 0
      ? "Select backups to delete"
      : `Permanently delete ${selectedIds.length} selected backup${selectedIds.length === 1 ? "" : "s"}`;

  return (
    <Stack gap="md" className={props.embedded ? classes.embedded : undefined}>
      {!props.embedded && (
        <Group justify="space-between" wrap="wrap" gap="sm" align="flex-end">
          <div>
            <Title order={3}>Backups for {props.server.name}</Title>
            <Text size="sm" c="dimmed">
              World schedule is separate from player join/leave and INI-on-save backups.
            </Text>
          </div>
        </Group>
      )}

      {!installReady && (
        <Alert
          color="yellow"
          variant="light"
          title="Install files required"
          data-backup-install-lock
        >
          {installLockReason} You can still browse, export, import, and delete
          archived backups.
        </Alert>
      )}

      <AppSurfaceCard className={classes.listPanel}>
        <Tabs
          value={activeKind}
          onChange={(value) => {
            if (value === "world" || value === "players" || value === "ini") {
              selectKind(value);
            }
          }}
          className={classes.kindTabs}
        >
          <Tabs.List className={classes.kindTabList}>
            {KIND_TABS.map((tab) => (
              <Tabs.Tab key={tab.kind} value={tab.kind}>
                {tab.label}
              </Tabs.Tab>
            ))}
          </Tabs.List>

          <Stack gap="sm" className={classes.listStack}>
            {draftPolicy !== null && (
              <div
                className={classes.kindSettings}
                data-world-settings={activeKind === "world" ? true : undefined}
                data-players-settings={activeKind === "players" ? true : undefined}
                data-ini-settings={activeKind === "ini" ? true : undefined}
                data-settings-open={settingsOpen ? "true" : "false"}
              >
                <UnstyledButton
                  className={classes.settingsToggle}
                  onClick={() => setSettingsOpen((open) => !open)}
                  aria-expanded={settingsOpen}
                >
                  <Group gap={6} wrap="nowrap" className={classes.settingsToggleInner}>
                    {settingsOpen ? <CaretDown size={14} /> : <CaretRight size={14} />}
                    <Text fw={600} size="xs" className={classes.settingsToggleTitle}>
                      {settingsTitle}
                    </Text>
                    {!settingsOpen && settingsSummary !== null && (
                      <Text size="xs" c="dimmed" className={classes.settingsSummary}>
                        {settingsSummary}
                      </Text>
                    )}
                  </Group>
                </UnstyledButton>

                {settingsOpen && activeKind === "world" && (
                  <Stack gap={6} mt={4} className={classes.kindSettingsFields}>
                    <Group align="center" gap={6} wrap="nowrap">
                      <Text size="xs" className={classes.inlineLabel}>
                        Destination
                      </Text>
                      <PathField
                        id="backup-destination"
                        className={classes.dirField}
                        size="xs"
                        inline
                        aria-label="Destination"
                        value={draftPolicy.backupDir ?? ""}
                        placeholder={
                          draftPolicy.backupDir === null || draftPolicy.backupDir.length === 0
                            ? defaultBackupHint
                            : (resolvedRoot ?? draftPolicy.backupDir)
                        }
                        busy={browsingDir}
                        disabled={busy}
                        clearable
                        onChange={(value) =>
                          setDraftPolicy({
                            ...draftPolicy,
                            backupDir: value.trim().length > 0 ? value : null,
                          })
                        }
                        onBrowse={() => void browseBackupDir()}
                      />
                      <Tooltip label="Open the backup destination folder">
                        <Button
                          variant="subtle"
                          size="xs"
                          leftSection={<FolderOpen size={12} />}
                          onClick={() => void openDestination()}
                          disabled={busy}
                        >
                          Open
                        </Button>
                      </Tooltip>
                    </Group>
                    <Group align="center" gap="sm" wrap="wrap">
                      <Switch
                        size="sm"
                        label="Schedule"
                        checked={draftPolicy.enabled}
                        disabled={busy || !installReady}
                        onChange={(event) =>
                          setDraftPolicy({
                            ...draftPolicy,
                            enabled: event.currentTarget.checked,
                          })
                        }
                      />
                      <Group gap={6} align="center" wrap="nowrap">
                        <Text size="xs" component="label" htmlFor="backup-interval">
                          Interval (min)
                        </Text>
                        <NumberInput
                          id="backup-interval"
                          aria-label="Interval (min)"
                          size="xs"
                          min={5}
                          max={10_080}
                          value={draftPolicy.intervalMinutes}
                          disabled={busy || !installReady}
                          onChange={(value) =>
                            setDraftPolicy({
                              ...draftPolicy,
                              intervalMinutes:
                                typeof value === "number"
                                  ? value
                                  : draftPolicy.intervalMinutes,
                            })
                          }
                          className={classes.policyField}
                        />
                      </Group>
                      <Group gap={6} align="center" wrap="nowrap">
                        <Text size="xs" component="label" htmlFor="backup-retain-world">
                          Keep last
                        </Text>
                        <NumberInput
                          id="backup-retain-world"
                          aria-label="Keep last"
                          size="xs"
                          min={1}
                          max={500}
                          value={draftPolicy.retainCountWorld}
                          onChange={(value) =>
                            setDraftPolicy({
                              ...draftPolicy,
                              retainCountWorld:
                                typeof value === "number"
                                  ? value
                                  : draftPolicy.retainCountWorld,
                            })
                          }
                          className={classes.policyField}
                        />
                      </Group>
                    </Group>
                  </Stack>
                )}

                {settingsOpen && activeKind === "players" && (
                  <Group gap="xs" align="center" wrap="nowrap" mt={4} className={classes.inlineRetain}>
                    <Text size="xs" component="label" htmlFor="backup-retain-players">
                      Keep last (per player)
                    </Text>
                    <NumberInput
                      id="backup-retain-players"
                      aria-label="Keep last (per player)"
                      size="xs"
                      min={1}
                      max={500}
                      value={draftPolicy.retainCountPlayers}
                      onChange={(value) =>
                        setDraftPolicy({
                          ...draftPolicy,
                          retainCountPlayers:
                            typeof value === "number"
                              ? value
                              : draftPolicy.retainCountPlayers,
                        })
                      }
                      className={classes.compactRetain}
                    />
                  </Group>
                )}

                {settingsOpen && activeKind === "ini" && (
                  <Group gap="xs" align="center" wrap="nowrap" mt={4} className={classes.inlineRetain}>
                    <Text size="xs" component="label" htmlFor="backup-retain-ini">
                      Keep last INI
                    </Text>
                    <NumberInput
                      id="backup-retain-ini"
                      aria-label="Keep last INI"
                      size="xs"
                      min={1}
                      max={500}
                      value={draftPolicy.retainCountIni}
                      onChange={(value) =>
                        setDraftPolicy({
                          ...draftPolicy,
                          retainCountIni:
                            typeof value === "number"
                              ? value
                              : draftPolicy.retainCountIni,
                        })
                      }
                      className={classes.compactRetain}
                    />
                  </Group>
                )}
              </div>
            )}

            <Group
              justify="space-between"
              wrap="wrap"
              align="center"
              gap="xs"
              className={classes.listToolbar}
            >
              <Group gap="xs" wrap="wrap" align="center">
                {selectableBackups.length > 0 && (
                  <Checkbox
                    label="Select all"
                    size="xs"
                    checked={allSelected}
                    indeterminate={selectedIds.length > 0 && !allSelected}
                    onChange={toggleSelectAll}
                    disabled={busy}
                  />
                )}
                {activeKind === "players" && kindBackups.length > 0 && (
                  <>
                    <TextInput
                      size="xs"
                      placeholder="Search players"
                      aria-label="Search players"
                      leftSection={<MagnifyingGlass size={14} />}
                      value={playerSearch}
                      onChange={(event) => setPlayerSearch(event.currentTarget.value)}
                      className={classes.playerSearch}
                    />
                    <Select
                      size="xs"
                      aria-label="Sort player backups"
                      data={PLAYER_SORT_OPTIONS}
                      value={playerSort}
                      onChange={(value) => {
                        if (
                          value === "newest"
                          || value === "oldest"
                          || value === "name-asc"
                          || value === "name-desc"
                        ) {
                          setPlayerSort(value);
                        }
                      }}
                      allowDeselect={false}
                      className={classes.playerSort}
                    />
                  </>
                )}
              </Group>
              <Group gap={6} wrap="wrap" align="center">
                {opsLocked && (
                  <Badge color="yellow" variant="light" size="sm">
                    {!installReady
                      ? "Install files before create/restore"
                      : props.opsLockReason != null
                        ? "Restore locked while files update"
                        : "Server active — stop before restore"}
                  </Badge>
                )}
                <Tooltip label="Reload the backup list">
                  <ActionIcon
                    variant="default"
                    size="sm"
                    aria-label="Refresh"
                    onClick={() => void forceRefresh()}
                    loading={refreshing}
                    disabled={loading || busy}
                  >
                    <ArrowClockwise size={16} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label={`Import a YARK ${activeKindLabel.toLowerCase()} ZIP into this catalog`}>
                  <Button
                    variant="default"
                    size="compact-sm"
                    leftSection={<UploadSimple size={14} />}
                    onClick={() => void importBackup()}
                    loading={busyOp === "import"}
                    disabled={
                      loading
                      || props.createLocked === true
                      || (busy && busyOp !== "import")
                    }
                  >
                    Import
                  </Button>
                </Tooltip>
                <Tooltip label={createTooltip}>
                  <Button
                    size="compact-sm"
                    leftSection={<HardDrives size={14} />}
                    onClick={() => void createBackup()}
                    loading={busyOp === "create"}
                    disabled={
                      loading
                      || createBlocked
                      || (busy && busyOp !== "create")
                    }
                  >
                    {createLabel}
                  </Button>
                </Tooltip>
                <Tooltip label={deleteTooltip}>
                  <span>
                    <Button
                      color="red"
                      variant="light"
                      size="compact-sm"
                      leftSection={<Trash size={14} />}
                      disabled={
                        busy ||
                        props.createLocked === true ||
                        selectedIds.length === 0
                      }
                      onClick={confirmDeleteSelected}
                    >
                      Delete
                      {selectedIds.length > 0 ? ` (${selectedIds.length})` : ""}
                    </Button>
                  </span>
                </Tooltip>
              </Group>
            </Group>

            <div className={classes.listScroll} data-backup-list>
              {loading && kindBackups.length === 0 ? (
                <div className={classes.listEmpty}>
                  <Text size="sm" c="dimmed">
                    Loading backups…
                  </Text>
                </div>
              ) : displayedBackups.length === 0 ? (
                <div className={classes.listEmpty} data-backup-list-empty>
                  <EmptyState
                    icon={<HardDrives size={22} />}
                    title="No backups"
                    description={emptyHint}
                  />
                </div>
              ) : (
                <Stack gap={4}>
                  {displayedBackups.map((backup) => {
                    const canSelect = backup.status !== "running";
                    const isPlayers = backup.kind === "players";
                    const finishedAt = backupFinishedAt(backup);
                    const relative = formatRelativeTime(finishedAt);
                    const absolute = formatWhen(finishedAt);
                    const displayTitle = isPlayers
                      ? playerBackupDisplayName(backup)
                      : relative;
                    const hasNotes = backup.notes !== null && backup.notes.length > 0;
                    const fileName = archiveFileName(backup.path);
                    return (
                      <div key={backup.id} className={classes.backupRow}>
                        <Checkbox
                          checked={selectedIdSet.has(backup.id)}
                          disabled={!canSelect || busy}
                          onChange={() => toggleSelected(backup.id)}
                          aria-label={`Select backup ${backup.id}`}
                          className={classes.backupCheck}
                          size="xs"
                        />
                        <div className={classes.backupMeta}>
                          <Group gap={6} wrap="nowrap" className={classes.backupPrimary}>
                            <Tooltip label={absolute} withArrow>
                              <Text
                                fw={600}
                                size="sm"
                                data-backup-title
                                className={classes.backupTitle}
                                title={isPlayers ? absolute : undefined}
                              >
                                {displayTitle}
                              </Text>
                            </Tooltip>
                            <Text size="xs" c="dimmed" className={classes.backupMetaInline}>
                              {isPlayers ? relative : null}
                              {isPlayers ? " · " : null}
                              {formatSize(backup.sizeBytes)}
                            </Text>
                            <Badge size="xs" color={statusColor(backup.status)} variant="light">
                              {backup.status}
                            </Badge>
                            <Badge size="xs" variant="outline" color="gray">
                              {backup.type}
                            </Badge>
                          </Group>
                          <Text
                            size="xs"
                            c="dimmed"
                            className={classes.backupFileName}
                            title={backup.path}
                            data-backup-filename
                          >
                            {fileName}
                          </Text>
                          {hasNotes && (
                            <Text
                              size="xs"
                              c="dimmed"
                              className={classes.backupNotes}
                              title={backup.notes ?? undefined}
                            >
                              {backup.notes}
                            </Text>
                          )}
                        </div>
                        <div className={classes.backupActions}>
                          <BackupHistoryRowActions
                            backup={backup}
                            busy={busy}
                            opsLocked={opsLocked}
                            onCopyDetails={(row) => void copyBackupDetails(row)}
                            onOpenFolder={(id) => void openBackupFolder(id)}
                            onExport={(row) => void exportBackup(row)}
                            onRestore={confirmRestore}
                            onDelete={confirmDeleteOne}
                          />
                        </div>
                      </div>
                    );
                  })}
                </Stack>
              )}
            </div>
          </Stack>
        </Tabs>
      </AppSurfaceCard>
    </Stack>
  );
}
