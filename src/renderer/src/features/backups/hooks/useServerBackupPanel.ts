import { runWithFinally } from "@renderer/shared/async/runWithFinally";
import { isInstallationReady } from "@shared/installation-health";
import type {
  BackupKind,
  BackupPolicyStatus,
  BackupRecord,
  ServerInstallationInfo,
  ServerProfile,
  ServerRuntimeInfo,
} from "@shared/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createServerBackupPanelActions,
  showBackupError,
  showBackupToast,
  type BackupBusyOp,
} from "../actions/serverBackupPanelActions";
import {
  backupsListKey,
  countHiddenOtherMapWorldBackups,
  draftEqualsDraft,
  draftEqualsPolicy,
  filterBackups,
  iniPolicySummary,
  isServerActive,
  kindLabel,
  playersPolicySummary,
  toDraft,
  worldPolicySummary,
  type DraftPolicy,
} from "../model/serverBackupPanelModel";

const POLICY_AUTOSAVE_MS = 450;

export interface UseServerBackupPanelOptions {
  server: ServerProfile;
  runtime: ServerRuntimeInfo | null;
  installation?: ServerInstallationInfo | null;
  opsLocked?: boolean;
  opsLockReason?: string;
  createLocked?: boolean;
  createLockReason?: string;
}

export function useServerBackupPanel(options: UseServerBackupPanelOptions) {
  const {
    server,
    runtime,
    installation,
    createLocked,
    createLockReason,
  } = options;
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [policy, setPolicy] = useState<BackupPolicyStatus | null>(null);
  const [draftPolicy, setDraftPolicy] = useState<DraftPolicy | null>(null);
  const [activeKind, setActiveKind] = useState<BackupKind>("world");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [resolvedRoot, setResolvedRoot] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busyOp, setBusyOp] = useState<BackupBusyOp | null>(null);
  const [browsingDir, setBrowsingDir] = useState(false);
  const [playerSearch, setPlayerSearch] = useState("");
  const [currentMapOnly, setCurrentMapOnly] = useState(true);
  const [restoreTarget, setRestoreTarget] = useState<BackupRecord | null>(null);
  const [restoreProfilesTribes, setRestoreProfilesTribes] = useState(true);
  // Always start open; collapse is session-local and resets when changing kind (#231).
  const [settingsOpen, setSettingsOpen] = useState(true);
  const loadGenRef = useRef(0);
  const saveGenRef = useRef(0);

  const installReady =
    installation === undefined ? true : isInstallationReady(installation);
  const installLockReason =
    installation?.guidance?.trim()
    || "Install server files before creating or restoring backups.";
  const serverActive = isServerActive(runtime);
  const createBlocked = createLocked === true || !installReady;
  const createBlockReason = !installReady
    ? installLockReason
    : (createLockReason ?? "Wait for the active backup to finish");
  const restoreLocked =
    options.opsLocked === true || serverActive || !installReady;
  const restoreLockReason = !installReady
    ? installLockReason
    : options.opsLockReason
      ?? (serverActive ? "Stop the server before restoring a backup." : undefined);

  const load = useCallback(
    async (serverId: string, loadOptions?: { quiet?: boolean }) => {
      const quiet = loadOptions?.quiet === true;
      const gen = ++loadGenRef.current;
      if (!quiet) setLoading(true);
      await runWithFinally(
        async () => {
          const [listRes, policyRes, rootRes] = await Promise.all([
            window.api.listBackups(serverId, 100),
            window.api.getBackupPolicy(serverId),
            window.api.resolveBackupRoot(serverId),
          ]);
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
          setBackups((previous) =>
            backupsListKey(previous) === backupsListKey(listRes.data)
              ? previous
              : listRes.data,
          );
          if (!policyRes.ok) {
            if (!quiet) {
              setPolicy(null);
              setDraftPolicy(null);
              setResolvedRoot(null);
              setSelectedIds([]);
            }
            showBackupError(policyRes.error ?? "Could not load backup policy");
            return;
          }
          setSelectedIds((previous) => {
            const next = previous.filter((id) =>
              listRes.data.some(
                (backup) => backup.id === id && backup.status !== "running",
              ),
            );
            return next.length === previous.length
              && next.every((id, index) => id === previous[index])
              ? previous
              : next;
          });
          setPolicy((previous) =>
            previous !== null && draftEqualsPolicy(toDraft(previous), policyRes.data)
              ? previous
              : policyRes.data,
          );
          if (!quiet) setDraftPolicy(toDraft(policyRes.data));
          setResolvedRoot((previous) => {
            const next = rootRes.ok ? rootRes.data : null;
            return previous === next ? previous : next;
          });
        },
        () => {
          if (gen === loadGenRef.current) setLoading(false);
        },
      );
    },
    [],
  );

  useEffect(() => {
    void load(server.id);
  }, [server.id, server.updatedAt, load]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void load(server.id, { quiet: true });
    }, 12_000);
    return () => window.clearInterval(timer);
  }, [server.id, load]);

  useEffect(() => {
    if (typeof window.api.onBackupsChanged !== "function") return undefined;
    return window.api.onBackupsChanged((payload) => {
      if (payload.serverId === server.id) void load(server.id, { quiet: true });
    });
  }, [server.id, load]);

  useEffect(() => {
    if (draftPolicy === null || policy === null) return;
    if (draftEqualsPolicy(draftPolicy, policy)) return;
    const snapshot = draftPolicy;
    const serverId = server.id;
    const timer = window.setTimeout(() => {
      void (async () => {
        const gen = ++saveGenRef.current;
        const result = await window.api.setBackupPolicy(serverId, snapshot);
        if (gen !== saveGenRef.current) return;
        if (!result.ok) {
          showBackupError(result.error ?? "Could not save backup policy");
          return;
        }
        setPolicy((previous) => ({
          ...result.data,
          schedulePaused: previous?.schedulePaused ?? false,
        }));
        setDraftPolicy((current) => {
          if (current === null) return toDraft(result.data);
          return draftEqualsDraft(current, snapshot) ? toDraft(result.data) : current;
        });
        const rootRes = await window.api.resolveBackupRoot(serverId);
        if (gen === saveGenRef.current && rootRes.ok) setResolvedRoot(rootRes.data);
      })();
    }, POLICY_AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
  }, [draftPolicy, policy, server.id]);

  const kindBackups = useMemo(
    () => backups.filter((backup) => backup.kind === activeKind),
    [backups, activeKind],
  );
  const displayedBackups = useMemo(
    () => filterBackups(
      backups,
      activeKind,
      playerSearch,
      currentMapOnly,
      server.map,
    ),
    [backups, activeKind, playerSearch, currentMapOnly, server.map],
  );
  const hiddenOtherMapWorldCount = useMemo(
    () => countHiddenOtherMapWorldBackups(
      backups,
      activeKind,
      currentMapOnly,
      server.map,
    ),
    [backups, activeKind, currentMapOnly, server.map],
  );
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

  const forceRefresh = async () => {
    setRefreshing(true);
    await runWithFinally(
      async () => {
        await load(server.id, { quiet: true });
        showBackupToast("Backup list refreshed.");
      },
      () => setRefreshing(false),
    );
  };
  const selectKind = (kind: BackupKind) => {
    setActiveKind(kind);
    setSelectedIds([]);
    // Collapse is not persisted across kind changes.
    setSettingsOpen(true);
  };

  const activeKindLabel = kindLabel(activeKind);
  const defaultBackupHint = `${server.installDir}\\Backups`;
  const settingsTitle =
    activeKind === "world"
      ? "World schedule & retention"
      : activeKind === "players"
        ? "Player retention"
        : "INI retention";
  const settingsSummary = draftPolicy === null
    ? null
    : activeKind === "world"
      ? worldPolicySummary(draftPolicy)
      : activeKind === "players"
        ? playersPolicySummary(draftPolicy)
        : iniPolicySummary(draftPolicy);
  const emptyHint =
    activeKind === "world"
      ? currentMapOnly && hiddenOtherMapWorldCount > 0
        ? `No world backups for ${server.map} yet. ${hiddenOtherMapWorldCount} backup${hiddenOtherMapWorldCount === 1 ? "" : "s"} for other maps are hidden. Uncheck “Current map only” to show them.`
        : "No world backups yet. Use Backup above or enable the world schedule."
      : activeKind === "players"
        ? playerSearch.trim().length > 0
          ? "No player backups match this search."
          : "No player profile backups yet. Profiles save automatically when players join or leave. Use a World backup when you need everyone at once."
        : "No INI backups yet. Use Backup above, or wait for the automatic copy after a successful INI save.";

  const actions = createServerBackupPanelActions({
    server,
    activeKind,
    actionableSelectedIds,
    draftPolicy,
    restoreTarget,
    restoreProfilesTribes,
    opsLocked: restoreLocked,
    opsLockReason: restoreLockReason,
    busyOp,
    setBusyOp,
    setBrowsingDir,
    setDraftPolicy,
    setSelectedIds,
    setRestoreTarget,
    setRestoreProfilesTribes,
    load,
  });

  return {
    policy,
    draftPolicy,
    setDraftPolicy,
    activeKind,
    selectKind,
    selectedIds,
    setSelectedIds,
    resolvedRoot,
    loading,
    refreshing,
    busyOp,
    busy: busyOp !== null,
    browsingDir,
    playerSearch,
    setPlayerSearch,
    currentMapOnly,
    setCurrentMapOnly,
    restoreTarget,
    restoreProfilesTribes,
    setRestoreProfilesTribes,
    settingsOpen,
    setSettingsOpen,
    installReady,
    installLockReason,
    createBlocked,
    createBlockReason,
    opsLocked: restoreLocked,
    opsLockReason: restoreLockReason,
    kindBackups,
    displayedBackups,
    actionableSelectedIds,
    activeKindLabel,
    defaultBackupHint,
    settingsTitle,
    settingsSummary,
    emptyHint,
    forceRefresh,
    ...actions,
  };
}
