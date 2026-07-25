import {
  ArrowClockwise,
  ArrowCounterClockwise,
  FloppyDisk,
  FolderOpen,
  MagnifyingGlass,
  Plus,
  Trash,
} from "@phosphor-icons/react";
import {
  Badge,
  Button,
  Card,
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
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { playerBackupDisplayName } from "@shared/backup-player-meta";
import type {
  BackupKind,
  BackupPolicy,
  BackupRecord,
  ServerProfile,
  ServerRuntimeInfo,
} from "@shared/types";
import { useEffect, useMemo, useRef, useState } from "react";
import classes from "./BackupsPage.module.css";

interface Props {
  server: ServerProfile;
  runtime: ServerRuntimeInfo | null;
  /** Compact layout for workspace tab (no outer page chrome). */
  embedded?: boolean;
}

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
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
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

function compareByCreatedAt(a: BackupRecord, b: BackupRecord, newestFirst: boolean): number {
  const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  return newestFirst ? -diff : diff;
}

function sortPlayerBackups(backups: BackupRecord[], sort: PlayerSort): BackupRecord[] {
  const next = [...backups];
  next.sort((a, b) => {
    if (sort === "newest") return compareByCreatedAt(a, b, true);
    if (sort === "oldest") return compareByCreatedAt(a, b, false);
    const nameA = playerBackupDisplayName(a).toLocaleLowerCase();
    const nameB = playerBackupDisplayName(b).toLocaleLowerCase();
    const byName = nameA.localeCompare(nameB);
    if (byName !== 0) return sort === "name-asc" ? byName : -byName;
    return compareByCreatedAt(a, b, true);
  });
  return next;
}

export function ServerBackupPanel(props: Props): JSX.Element {
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [policy, setPolicy] = useState<BackupPolicy | null>(null);
  const [draftPolicy, setDraftPolicy] = useState<DraftPolicy | null>(null);
  const [activeKind, setActiveKind] = useState<BackupKind>("world");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [resolvedRoot, setResolvedRoot] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [browsingDir, setBrowsingDir] = useState(false);
  const [playerSearch, setPlayerSearch] = useState("");
  const [playerSort, setPlayerSort] = useState<PlayerSort>("newest");
  const loadGenRef = useRef(0);

  const serverActive = isServerActive(props.runtime);
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
  const allSelected =
    selectableBackups.length > 0
    && selectableBackups.every((b) => selectedIds.includes(b.id));

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

  const forceRefresh = async () => {
    await load(props.server.id, { quiet: true });
    showBackupToast("Backup list refreshed.");
  };

  const selectKind = (kind: BackupKind) => {
    setActiveKind(kind);
    setSelectedIds([]);
  };

  const createBackup = async () => {
    setBusy(true);
    const result = await window.api.createManualBackup(props.server.id, [activeKind]);
    setBusy(false);
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
  };

  const savePolicy = async (message = "Backup settings saved.") => {
    if (draftPolicy === null) return;
    setBusy(true);
    const result = await window.api.setBackupPolicy(props.server.id, draftPolicy);
    setBusy(false);
    if (!result.ok) {
      showBackupError(result.error ?? "Could not save backup policy");
      return;
    }
    setPolicy(result.data);
    setDraftPolicy(toDraft(result.data));
    const rootRes = await window.api.resolveBackupRoot(props.server.id);
    if (rootRes.ok) setResolvedRoot(rootRes.data);
    showBackupToast(message);
  };

  const browseBackupDir = async () => {
    if (draftPolicy === null) return;
    setBrowsingDir(true);
    const result = await window.api.pickPath(
      "directory",
      draftPolicy.backupDir ?? props.server.installDir,
      "Choose backup destination",
    );
    setBrowsingDir(false);
    if (!result.ok) {
      showBackupError(result.error ?? "Could not open folder picker");
      return;
    }
    if (result.data !== null) {
      setDraftPolicy({ ...draftPolicy, backupDir: result.data });
    }
  };

  const openDestination = async () => {
    setBusy(true);
    const result = await window.api.openBackupRoot(props.server.id);
    setBusy(false);
    if (!result.ok) {
      showBackupError(result.error ?? "Could not open backup destination");
    }
  };

  const openBackupFolder = async (backupId: string) => {
    setBusy(true);
    const result = await window.api.openBackupFolder(props.server.id, backupId);
    setBusy(false);
    if (!result.ok) {
      showBackupError(result.error ?? "Could not open backup folder");
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
        void (async () => {
          setBusy(true);
          const result = await window.api.deleteBackups(props.server.id, selectedIds);
          setBusy(false);
          if (!result.ok) {
            showBackupError(result.error ?? "Could not delete backups");
            return;
          }
          setSelectedIds([]);
          await load(props.server.id);
          showBackupToast(
            `Deleted ${result.data} backup${result.data === 1 ? "" : "s"}.`,
          );
        })();
      },
    });
  };

  const confirmRestore = (backup: BackupRecord) => {
    if (serverActive) {
      showBackupError("Stop the server before restoring a backup.");
      return;
    }
    const label = kindLabel(backup.kind);
    modals.openConfirmModal({
      title: "Restore backup?",
      children: (
        <Text size="sm">
          Restore <strong>{label}</strong> ({backup.type}) from{" "}
          {formatWhen(backup.createdAt)} onto{" "}
          <strong>{props.server.name}</strong>? Only that kind of data is replaced.
          A safety backup of the same kind is created first. The server must stay stopped.
        </Text>
      ),
      labels: { confirm: "Restore", cancel: "Cancel" },
      confirmProps: { color: "orange" },
      onConfirm: () => {
        void (async () => {
          setBusy(true);
          const result = await window.api.restoreBackup(props.server.id, backup.id);
          setBusy(false);
          if (!result.ok) {
            showBackupError(result.error ?? "Could not restore backup");
            return;
          }
          await load(props.server.id);
          showBackupToast(
            `${label} backup restored. A pre-restore safety copy was kept.`,
          );
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
          : "No player-profile backups yet. Manual backup snapshots all profiles; join/leave also creates per-player archives while the server is running."
        : "No INI backups yet. Create one manually — an automatic copy is also taken after each successful INI save.";

  const kindSubtitle =
    activeKind === "world"
      ? "Manual create or scheduled world saves"
      : activeKind === "players"
        ? "Per-player on connect/disconnect · keep last N per player"
        : "Automatic backup after each successful INI save";

  return (
    <Stack gap="md" className={props.embedded ? classes.embedded : undefined}>
      <Group justify="space-between" wrap="wrap" gap="sm" align="flex-end">
        <div>
          <Title order={props.embedded ? 4 : 3}>Backups for {props.server.name}</Title>
          <Text size="sm" c="dimmed">
            World schedule is separate from player join/leave and INI-on-save backups.
          </Text>
        </div>
      </Group>

      <Card withBorder className={`${classes.panel} ${classes.listPanel}`}>
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
            {activeKind === "world" && draftPolicy !== null && (
              <div className={classes.kindSettings} data-world-settings>
                <Group justify="space-between" align="center" wrap="wrap" gap={6}>
                  <Text fw={600} size="xs">
                    World destination & schedule
                  </Text>
                  <Group gap={6}>
                    <Button
                      variant="subtle"
                      size="compact-xs"
                      leftSection={<FolderOpen size={12} />}
                      onClick={() => void openDestination()}
                      disabled={busy}
                    >
                      Open
                    </Button>
                    <Button
                      variant="light"
                      size="compact-xs"
                      leftSection={<FloppyDisk size={12} />}
                      onClick={() => void savePolicy("World schedule and destination saved.")}
                      loading={busy}
                      disabled={loading}
                    >
                      Save policy
                    </Button>
                  </Group>
                </Group>

                <Stack gap={6} mt={4} className={classes.kindSettingsFields}>
                  <Group align="flex-end" gap={6} wrap="nowrap">
                    <TextInput
                      className={classes.dirField}
                      size="xs"
                      label="Destination"
                      description="Uses World / Player profiles / INI subfolders; each backup is a .zip"
                      value={draftPolicy.backupDir ?? ""}
                      placeholder={
                        draftPolicy.backupDir === null || draftPolicy.backupDir.length === 0
                          ? defaultBackupHint
                          : (resolvedRoot ?? draftPolicy.backupDir)
                      }
                      onChange={(event) =>
                        setDraftPolicy({
                          ...draftPolicy,
                          backupDir:
                            event.currentTarget.value.trim().length > 0
                              ? event.currentTarget.value
                              : null,
                        })
                      }
                    />
                    <Button
                      variant="default"
                      size="xs"
                      onClick={() => void browseBackupDir()}
                      loading={browsingDir}
                      disabled={busy}
                    >
                      Browse
                    </Button>
                  </Group>
                  <Group align="center" gap="sm" wrap="wrap">
                    <Switch
                      size="sm"
                      label="Schedule world backups"
                      checked={draftPolicy.enabled}
                      onChange={(event) =>
                        setDraftPolicy({
                          ...draftPolicy,
                          enabled: event.currentTarget.checked,
                        })
                      }
                    />
                    <NumberInput
                      size="xs"
                      label="Interval (min)"
                      min={5}
                      max={10_080}
                      value={draftPolicy.intervalMinutes}
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
                    <NumberInput
                      size="xs"
                      label="Keep last"
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
                </Stack>
                {policy !== null && (
                  <Text size="xs" c="dimmed" className={classes.kindSettingsMeta}>
                    Updated {formatWhen(policy.updatedAt)}
                    {resolvedRoot !== null ? ` · ${resolvedRoot}` : ""}
                  </Text>
                )}
              </div>
            )}

            {activeKind === "players" && draftPolicy !== null && (
              <div className={classes.kindSettings} data-players-settings>
                <Group justify="space-between" align="flex-end" wrap="wrap" gap="sm">
                  <Text fw={600} size="xs">
                    Player retention
                  </Text>
                  <Group gap="xs" align="flex-end">
                    <NumberInput
                      label="Keep last (per player)"
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
                    <Button
                      size="compact-xs"
                      variant="light"
                      onClick={() => void savePolicy("Player retention saved.")}
                      loading={busy}
                    >
                      Save
                    </Button>
                  </Group>
                </Group>
              </div>
            )}

            {activeKind === "ini" && draftPolicy !== null && (
              <div className={classes.kindSettings} data-ini-settings>
                <Group justify="space-between" align="flex-end" wrap="wrap" gap="sm">
                  <Text fw={600} size="xs">
                    INI retention
                  </Text>
                  <Group gap="xs" align="flex-end">
                    <NumberInput
                      label="Keep last INI"
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
                    <Button
                      size="compact-xs"
                      variant="light"
                      onClick={() => void savePolicy("INI retention saved.")}
                      loading={busy}
                    >
                      Save
                    </Button>
                  </Group>
                </Group>
              </div>
            )}

            <Group
              justify="space-between"
              wrap="wrap"
              align="flex-end"
              className={classes.listHeader}
            >
              <Group gap="sm" align="flex-end" wrap="wrap">
                <div>
                  <Title order={5}>{activeKindLabel} history</Title>
                  <Text size="xs" c="dimmed">
                    {kindSubtitle}
                  </Text>
                </div>
                {selectableBackups.length > 0 && (
                  <Checkbox
                    label="Select all"
                    checked={allSelected}
                    indeterminate={selectedIds.length > 0 && !allSelected}
                    onChange={toggleSelectAll}
                    disabled={busy}
                  />
                )}
              </Group>
              <Group gap="xs">
                {serverActive && (
                  <Badge color="yellow" variant="light">
                    Server active — stop before restore
                  </Badge>
                )}
                <Button
                  variant="default"
                  leftSection={<ArrowClockwise size={16} />}
                  onClick={() => void forceRefresh()}
                  loading={refreshing}
                  disabled={loading || busy}
                >
                  Refresh
                </Button>
                <Button
                  leftSection={<Plus size={16} />}
                  onClick={() => void createBackup()}
                  loading={busy}
                  disabled={loading}
                >
                  {activeKind === "players"
                    ? "Backup all players"
                    : `Create ${activeKindLabel} backup`}
                </Button>
                <Button
                  color="red"
                  variant="light"
                  leftSection={<Trash size={16} />}
                  disabled={busy || selectedIds.length === 0}
                  onClick={confirmDeleteSelected}
                >
                  Delete selected
                  {selectedIds.length > 0 ? ` (${selectedIds.length})` : ""}
                </Button>
              </Group>
            </Group>

            {activeKind === "players" && kindBackups.length > 0 && (
              <Group gap="sm" wrap="wrap" align="flex-end" className={classes.listToolbar}>
                <TextInput
                  size="xs"
                  label="Search players"
                  placeholder="Filter by player name"
                  leftSection={<MagnifyingGlass size={14} />}
                  value={playerSearch}
                  onChange={(event) => setPlayerSearch(event.currentTarget.value)}
                  className={classes.playerSearch}
                />
                <Select
                  size="xs"
                  label="Sort"
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
              </Group>
            )}

            <div className={classes.listScroll} data-backup-list>
              {loading && kindBackups.length === 0 ? (
                <div className={classes.listEmpty}>
                  <Text size="sm" c="dimmed">
                    Loading backups…
                  </Text>
                </div>
              ) : displayedBackups.length === 0 ? (
                <div className={classes.listEmpty} data-backup-list-empty>
                  <Text size="sm" c="dimmed" ta="center">
                    {emptyHint}
                  </Text>
                </div>
              ) : (
                <Stack gap={8}>
                  {displayedBackups.map((backup) => {
                    const canSelect = backup.status !== "running";
                    const isPlayers = backup.kind === "players";
                    const displayTitle = isPlayers
                      ? playerBackupDisplayName(backup)
                      : backup.type;
                    return (
                      <div key={backup.id} className={classes.backupRow}>
                        <Checkbox
                          checked={selectedIds.includes(backup.id)}
                          disabled={!canSelect || busy}
                          onChange={() => toggleSelected(backup.id)}
                          aria-label={`Select backup ${backup.id}`}
                          className={classes.backupCheck}
                        />
                        <div className={classes.backupMeta}>
                          <Group gap="xs" wrap="wrap">
                            <Text fw={600} size="sm" data-backup-title>
                              {displayTitle}
                            </Text>
                            <Badge size="sm" color={statusColor(backup.status)} variant="light">
                              {backup.status}
                            </Badge>
                            {isPlayers && (
                              <Badge size="sm" variant="outline" color="gray">
                                {backup.type}
                              </Badge>
                            )}
                          </Group>
                          <Text size="xs" c="dimmed">
                            {formatWhen(backup.createdAt)} · {formatSize(backup.sizeBytes)}
                            {!isPlayers ? ` · ${backup.type}` : ""}
                          </Text>
                          <Text size="xs" c="dimmed" className={classes.path}>
                            {backup.path}
                          </Text>
                          {backup.notes !== null && backup.notes.length > 0 && (
                            <Text size="xs" c="dimmed">
                              {backup.notes}
                            </Text>
                          )}
                        </div>
                        <Group gap="xs">
                          <Button
                            variant="subtle"
                            size="xs"
                            leftSection={<FolderOpen size={14} />}
                            disabled={busy}
                            onClick={() => void openBackupFolder(backup.id)}
                          >
                            Open folder
                          </Button>
                          <Button
                            variant="light"
                            color="orange"
                            size="xs"
                            leftSection={<ArrowCounterClockwise size={14} />}
                            disabled={busy || backup.status !== "completed" || serverActive}
                            onClick={() => confirmRestore(backup)}
                          >
                            Restore
                          </Button>
                        </Group>
                      </div>
                    );
                  })}
                </Stack>
              )}
            </div>
          </Stack>
        </Tabs>
      </Card>
    </Stack>
  );
}
