import { runWithFinally } from "@renderer/shared/async/runWithFinally";
import type { ReactElement } from "react";
import {
  ArrowClockwise,
  CaretDown,
  CaretRight,
  FolderOpen,
  HardDrives,
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
  Stack,
  Switch,
  Tabs,
  Text,
  Title,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { showOperatorError, showOperatorToast } from "@ui/operatorToast";
import { playerBackupDisplayName } from "@shared/backup-player-meta";
import { isInstallationReady } from "@shared/installation-health";
import type {
  BackupKind,
  BackupPolicy,
  BackupPolicyStatus,
  BackupRecord,
  ServerInstallationInfo,
  ServerProfile,
  ServerRuntimeInfo,
} from "@shared/types";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";
import { PathField } from "@ui/PathField/PathField";
import { SearchField } from "@ui/SearchField/SearchField";
import { BackupHistoryTable } from "./BackupHistoryTable";
import { BackupRestoreModal } from "./BackupRestoreModal";
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

const KIND_TABS: Array<{ kind: BackupKind; label: string }> = [
  { kind: "world", label: "World save" },
  { kind: "players", label: "Player profiles" },
  { kind: "ini", label: "INI" },
];

function formatSize(sizeBytes: number): string {
  if (sizeBytes <= 0) return "–";
  if (sizeBytes >= 1024 * 1024) {
    return `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  return `${(sizeBytes / 1024).toFixed(1)} KB`;
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
  showOperatorToast({
    title: options?.title ?? "Backups",
    message,
    color: options?.color ?? "teal",
    autoClose: options?.autoClose ?? 5000,
  });
}

function showBackupError(message: string): void {
  showOperatorError(message, "Backups");
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

function sameMapToken(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = (a ?? "").trim().toLowerCase();
  const right = (b ?? "").trim().toLowerCase();
  if (left.length === 0 || right.length === 0) return false;
  return left === right;
}

function backupsListKey(rows: BackupRecord[]): string {
  return rows
    .map(
      (backup) =>
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

export function ServerBackupPanel(props: Props): ReactElement {
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [policy, setPolicy] = useState<BackupPolicyStatus | null>(null);
  const [draftPolicy, setDraftPolicy] = useState<DraftPolicy | null>(null);
  const [activeKind, setActiveKind] = useState<BackupKind>("world");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [resolvedRoot, setResolvedRoot] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busyOp, setBusyOp] = useState<BusyOp | null>(null);
  const [browsingDir, setBrowsingDir] = useState(false);
  const [playerSearch, setPlayerSearch] = useState("");
  const [currentMapOnly, setCurrentMapOnly] = useState(true);
  const [restoreTarget, setRestoreTarget] = useState<BackupRecord | null>(null);
  const [restoreProfilesTribes, setRestoreProfilesTribes] = useState(true);
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
    if (activeKind === "players") {
      const query = playerSearch.trim().toLocaleLowerCase();
      if (query.length === 0) return kindBackups;
      return kindBackups.filter((backup) =>
        playerBackupDisplayName(backup).toLocaleLowerCase().includes(query),
      );
    }
    if (activeKind === "world" && currentMapOnly) {
      return kindBackups.filter((backup) =>
        sameMapToken(backup.mapToken, props.server.map),
      );
    }
    return kindBackups;
  }, [
    activeKind,
    kindBackups,
    playerSearch,
    currentMapOnly,
    props.server.map,
  ]);

  const hiddenOtherMapWorldCount = useMemo(() => {
    if (activeKind !== "world" || !currentMapOnly) return 0;
    return kindBackups.filter(
      (backup) => !sameMapToken(backup.mapToken, props.server.map),
    ).length;
  }, [activeKind, currentMapOnly, kindBackups, props.server.map]);

  const displayedBackupIds = useMemo(
    () => new Set(displayedBackups.map((backup) => backup.id)),
    [displayedBackups],
  );
  const actionableSelectedIds = useMemo(
    () => selectedIds.filter((id) => displayedBackupIds.has(id)),
    [selectedIds, displayedBackupIds],
  );

  useEffect(() => {
    setSelectedIds((previous) => {
      const next = previous.filter((id) => displayedBackupIds.has(id));
      return next.length === previous.length ? previous : next;
    });
  }, [displayedBackupIds]);
  const load = async (serverId: string, opts?: { quiet?: boolean }) => {
    const quiet = opts?.quiet === true;
    const gen = ++loadGenRef.current;
    if (!quiet) {
      setLoading(true);
    }
    // Quiet interval / push: no toolbar spinner — avoid ~12s flicker (#163).
    await runWithFinally(
      async () => {
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
          setBackups((previous) =>
            backupsListKey(previous) === backupsListKey(listRes.data)
              ? previous
              : listRes.data,
          );
          if (!quiet) {
            setPolicy(null);
            setDraftPolicy(null);
            setResolvedRoot(null);
            setSelectedIds([]);
          }
          showBackupError(policyRes.error ?? "Could not load backup policy");
          return;
        }
        setBackups((previous) =>
          backupsListKey(previous) === backupsListKey(listRes.data)
            ? previous
            : listRes.data,
        );
        setSelectedIds((prev) => {
          const next = prev.filter((id) =>
            listRes.data.some((b) => b.id === id && b.status !== "running"),
          );
          if (
            next.length === prev.length &&
            next.every((id, index) => id === prev[index])
          ) {
            return prev;
          }
          return next;
        });
        setPolicy((previous) =>
          previous !== null && draftEqualsPolicy(toDraft(previous), policyRes.data)
            ? previous
            : policyRes.data,
        );
        // Quiet refresh must not clobber unsaved destination/schedule/retention edits.
        if (!quiet) {
          setDraftPolicy(toDraft(policyRes.data));
        }
        setResolvedRoot((previous) => {
          const nextRoot = rootRes.ok ? rootRes.data : null;
          return previous === nextRoot ? previous : nextRoot;
        });
      },
      () => {
        if (gen === loadGenRef.current) {
          setLoading(false);
        }
      },
    );
  };
  useEffect(() => {
    void load(props.server.id);
  }, [props.server.id, props.server.updatedAt]);

  // Quiet refresh only while this panel is mounted (workspace Backups tab).
  // Join/leave archives also arrive via onBackupsChanged; no App-level backup poll.
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
        setPolicy((prev) => ({
          ...result.data,
          schedulePaused: prev?.schedulePaused ?? false,
        }));
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
    setRefreshing(true);
    await runWithFinally(
      async () => {
        await load(props.server.id, { quiet: true });
        showBackupToast("Backup list refreshed.");
      },
      () => {
        setRefreshing(false);
      },
    );
  };

  const selectKind = (kind: BackupKind) => {
    setActiveKind(kind);
    setSelectedIds([]);
    setSettingsOpen(true);
  };

  const createBackup = async () => {
    setBusyOp("create");
    await runWithFinally(
      async () => {
        const result = await window.api.createManualBackup(props.server.id, [activeKind]);
        if (!result.ok) {
          showBackupError(result.error ?? "Could not create backup");
          return;
        }
        await load(props.server.id);
        showBackupToast(`${activeKindLabel} backup completed.`);
      },
      () => {
        setBusyOp(null);
      },
    );
  };

  const browseBackupDir = async () => {
    if (draftPolicy === null) return;
    setBrowsingDir(true);
    await runWithFinally(
      async () => {
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
      },
      () => {
        setBrowsingDir(false);
      },
    );
  };

  const openDestination = async () => {
    setBusyOp("other");
    await runWithFinally(
      async () => {
        const result = await window.api.openBackupRoot(props.server.id);
        if (!result.ok) {
          showBackupError(result.error ?? "Could not open backup destination");
        }
      },
      () => {
        setBusyOp(null);
      },
    );
  };

  const openBackupFolder = async (backupId: string) => {
    setBusyOp("other");
    await runWithFinally(
      async () => {
        const result = await window.api.openBackupFolder(props.server.id, backupId);
        if (!result.ok) {
          showBackupError(result.error ?? "Could not open backup folder");
        }
      },
      () => {
        setBusyOp(null);
      },
    );
  };

  const exportBackup = async (backup: BackupRecord) => {
    setBusyOp("export");
    await runWithFinally(
      async () => {
        await runBackupExport({
          serverId: props.server.id,
          serverName: props.server.name,
          backup,
          onError: showBackupError,
          onSuccess: (path) => showBackupToast(`Exported to ${path}`),
        });
      },
      () => {
        setBusyOp(null);
      },
    );
  };

  const importBackup = async () => {
    setBusyOp("import");
    await runWithFinally(
      async () => {
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
      },
      () => {
        setBusyOp(null);
      },
    );
  };

  const deleteBackupsByIds = async (backupIds: string[]) => {
    setBusyOp("other");
    await runWithFinally(
      async () => {
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
      },
      () => {
        setBusyOp(null);
      },
    );
  };

  const confirmDeleteSelected = () => {
    if (actionableSelectedIds.length === 0) return;
    const ids = [...actionableSelectedIds];
    const count = ids.length;
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
        void deleteBackupsByIds(ids);
      },
    });
  };

  const confirmClearFailed = () => {
    modals.openConfirmModal({
      title: `Clear failed ${activeKindLabel.toLowerCase()} backups?`,
      children: (
        <Text size="sm">
          Remove every failed {activeKindLabel.toLowerCase()} record for this server
          from history. Archives are usually already missing; this is catalog cleanup.
        </Text>
      ),
      labels: { confirm: "Clear failed", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: () => {
        setBusyOp("other");
        void runWithFinally(
          async () => {
            const result = await window.api.deleteFailedBackups(
              props.server.id,
              activeKind,
            );
            if (!result.ok) {
              showBackupError(result.error ?? "Could not clear failed backups");
              return;
            }
            await load(props.server.id);
            showBackupToast(
              result.data === 0
                ? "No failed backup records to clear."
                : `Cleared ${result.data} failed backup record${result.data === 1 ? "" : "s"}.`,
            );
          },
          () => {
            setBusyOp(null);
          },
        );
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
    setRestoreProfilesTribes(true);
    setRestoreTarget(backup);
  };

  const closeRestoreModal = () => {
    if (busyOp === "other") return;
    setRestoreTarget(null);
  };

  const runRestore = async () => {
    if (restoreTarget === null) return;
    const backup = restoreTarget;
    const label = kindLabel(backup.kind);
    setBusyOp("other");
    await runWithFinally(
      async () => {
        const result = await window.api.restoreBackup(
          props.server.id,
          backup.id,
          backup.kind === "world"
            ? { restoreProfilesTribes }
            : undefined,
        );
        if (!result.ok) {
          showBackupError(result.error ?? "Could not restore backup");
          return;
        }
        setRestoreTarget(null);
        await load(props.server.id);
        showBackupToast(
          `${label} backup restored. A pre-restore safety copy was kept.`,
        );
      },
      () => {
        setBusyOp(null);
      },
    );
  };

  const emptyHint =
    activeKind === "world"
      ? currentMapOnly && hiddenOtherMapWorldCount > 0
        ? `No world backups for ${props.server.map} yet. ${hiddenOtherMapWorldCount} backup${hiddenOtherMapWorldCount === 1 ? "" : "s"} for other maps are hidden. Uncheck “Current map only” to show them.`
        : "No world backups yet. Create one manually or enable the world schedule."
      : activeKind === "players"
        ? playerSearch.trim().length > 0
          ? "No player backups match this search."
          : "No player profile backups yet. Profiles are saved automatically when players join or leave. Use a World backup when you need everyone at once."
        : "No INI backups yet. Create one manually. An automatic copy is also taken after each successful INI save.";

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

  const createLabel = "Backup";
  const createTooltip = createBlocked
    ? createBlockReason
    : activeKind === "world"
      ? "Create a manual world save backup now"
      : "Create a manual backup of Game.ini and GameUserSettings.ini";
  const showManualCreate = activeKind !== "players";
  const showImport = activeKind !== "players";
  const deleteTooltip =
    actionableSelectedIds.length === 0
      ? "Select backups to delete"
      : `Permanently delete ${actionableSelectedIds.length} selected backup${actionableSelectedIds.length === 1 ? "" : "s"}`;

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

      {policy?.schedulePaused === true && (
        <Alert
          color="red"
          variant="light"
          title="World schedule paused"
          data-backup-schedule-paused
        >
          Scheduled world backups are paused for this YARK session after repeated
          failures. Policy stays enabled; restart YARK to resume after fixing the
          cause (destination, map folder, or disk space).
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
                          Keep last (per map)
                        </Text>
                        <NumberInput
                          id="backup-retain-world"
                          aria-label="Keep last (per map)"
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
                {activeKind === "world" && kindBackups.length > 0 && (
                  <Checkbox
                    size="xs"
                    label={`Current map only (${props.server.map})`}
                    checked={currentMapOnly}
                    onChange={(event) => setCurrentMapOnly(event.currentTarget.checked)}
                  />
                )}
                {activeKind === "players" && kindBackups.length > 0 && (
                  <SearchField
                    size="xs"
                    placeholder="Search players"
                    label="Search players"
                    value={playerSearch}
                    onChange={setPlayerSearch}
                    className={classes.playerSearch}
                  />
                )}
              </Group>
              <Group gap={6} wrap="wrap" align="center">
                {opsLocked && (
                  <Badge color="yellow" variant="light" size="sm">
                    {!installReady
                      ? "Install files before create/restore"
                      : props.opsLockReason != null
                        ? "Restore locked while files update"
                        : "Server active – stop before restore"}
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
                {showImport && (
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
                )}
                {showManualCreate && (
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
                )}
                <Tooltip label={deleteTooltip}>
                  <span>
                    <Button
                      color="red"
                      variant="filled"
                      size="compact-sm"
                      leftSection={<Trash size={14} />}
                      disabled={
                        busy ||
                        props.createLocked === true ||
                        actionableSelectedIds.length === 0
                      }
                      onClick={confirmDeleteSelected}
                    >
                      Delete
                      {actionableSelectedIds.length > 0 ? ` (${actionableSelectedIds.length})` : ""}
                    </Button>
                  </span>
                </Tooltip>
                <Tooltip label="Remove every failed row for this server and backup kind">
                  <Button
                    color="red"
                    variant="filled"
                    size="compact-sm"
                    disabled={busy || props.createLocked === true}
                    onClick={confirmClearFailed}
                    data-backup-clear-failed
                  >
                    Clear failed
                  </Button>
                </Tooltip>
              </Group>
            </Group>

            <div className={classes.listScroll} data-backup-list>
              <BackupHistoryTable
                key={activeKind}
                kind={activeKind}
                records={displayedBackups}
                selectedIds={selectedIds}
                busy={busy}
                opsLocked={opsLocked}
                fetching={loading && kindBackups.length === 0}
                emptyHint={emptyHint}
                onSelectedIdsChange={setSelectedIds}
                onCopyDetails={(row) => void copyBackupDetails(row)}
                onOpenFolder={(id) => void openBackupFolder(id)}
                onExport={(row) => void exportBackup(row)}
                onRestore={confirmRestore}
                onDelete={confirmDeleteOne}
                formatSize={formatSize}
                formatRelativeTime={formatRelativeTime}
              />
            </div>
          </Stack>
        </Tabs>
      </AppSurfaceCard>

      <BackupRestoreModal
        backup={restoreTarget}
        serverName={props.server.name}
        serverMap={props.server.map}
        restoreProfilesTribes={restoreProfilesTribes}
        busy={busyOp === "other"}
        onRestoreProfilesTribesChange={setRestoreProfilesTribes}
        onClose={closeRestoreModal}
        onConfirm={() => void runRestore()}
      />
    </Stack>
  );
}
