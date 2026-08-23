import { runWithFinally } from "@renderer/shared/async/runWithFinally";
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { showOperatorError, showOperatorToast } from "@ui/operatorToast";
import type {
  BackupCleanupOptions,
  BackupCleanupPreview,
  BackupDiskAlertSettings,
  BackupFleetSummary,
  ServerProfile,
} from "@shared/types";
import {
  isBackupDiskDraftDirty,
  isBackupPolicyDraftDirty,
  toBackupPolicyDraft,
  type BackupPolicyDraft,
} from "../backupPolicyDraft";
import {
  type BackupHealthFilter,
  formatBackupBytes,
} from "../model/backupsPageModel";

const DEFAULT_CLEANUP: BackupCleanupOptions = {
  serverIds: null,
  includeFailed: true,
  enforceRetention: true,
  olderThanDays: null,
  keepLastPerKind: null,
  protectNewestWorld: true,
};

export function useBackupsPageFleet(servers: ServerProfile[]): {
  summary: BackupFleetSummary | null;
  drafts: Record<string, BackupPolicyDraft>;
  setDrafts: Dispatch<SetStateAction<Record<string, BackupPolicyDraft>>>;
  expandedId: string | null;
  setExpandedId: Dispatch<SetStateAction<string | null>>;
  loading: boolean;
  busyId: string | null;
  browsingId: string | null;
  healthFilter: BackupHealthFilter;
  setHealthFilter: Dispatch<SetStateAction<BackupHealthFilter>>;
  diskModalOpen: boolean;
  setDiskModalOpen: Dispatch<SetStateAction<boolean>>;
  diskDraft: BackupDiskAlertSettings | null;
  setDiskDraft: Dispatch<SetStateAction<BackupDiskAlertSettings | null>>;
  diskBusy: boolean;
  cleanupOpen: boolean;
  setCleanupOpen: Dispatch<SetStateAction<boolean>>;
  cleanupOptions: BackupCleanupOptions;
  setCleanupOptions: Dispatch<SetStateAction<BackupCleanupOptions>>;
  cleanupPreview: BackupCleanupPreview | null;
  cleanupBusy: boolean;
  olderThanEnabled: boolean;
  setOlderThanEnabled: Dispatch<SetStateAction<boolean>>;
  olderThanDays: number;
  setOlderThanDays: Dispatch<SetStateAction<number>>;
  keepLastEnabled: boolean;
  setKeepLastEnabled: Dispatch<SetStateAction<boolean>>;
  keepLastPerKind: number;
  setKeepLastPerKind: Dispatch<SetStateAction<number>>;
  filteredServers: BackupFleetSummary["servers"];
  backupFleetQuiet: boolean;
  serverById: Map<string, ServerProfile>;
  load: (opts?: {
    quiet?: boolean;
    forceDraftSync?: boolean;
    cancelled?: () => boolean;
  }) => Promise<void>;
  savePolicy: (serverId: string) => Promise<void>;
  browseBackupDir: (server: ServerProfile) => Promise<void>;
  openDestination: (serverId: string) => Promise<void>;
  saveDiskSettings: () => Promise<void>;
  dismissFleetAlert: (alert: { id: string; fingerprint: string }) => Promise<void>;
  openCleanupModal: () => void;
  openCleanupModalFromToolbar: () => void;
  runPreviewCleanup: () => Promise<void>;
  confirmCleanup: () => Promise<void>;
  clearCleanupPreview: () => void;
} {
  const [summary, setSummary] = useState<BackupFleetSummary | null>(null);
  const [drafts, setDrafts] = useState<Record<string, BackupPolicyDraft>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [browsingId, setBrowsingId] = useState<string | null>(null);
  const [healthFilter, setHealthFilter] = useState<BackupHealthFilter>("all");
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
    forceDraftSync?: boolean;
    cancelled?: () => boolean;
  }) => {
    const quiet = opts?.quiet === true;
    const forceDraftSync = opts?.forceDraftSync === true;
    const cancelled = opts?.cancelled;
    const generation = quiet
      ? loadGenerationRef.current
      : ++loadGenerationRef.current;
    if (!quiet) {
      setLoading(true);
    }
    await runWithFinally(
      async () => {
        if (servers.length === 0) {
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
        if (!quiet) {
          setDrafts((previous) => {
            const nextDrafts: Record<string, BackupPolicyDraft> = {};
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
      },
      () => {
        if (!quiet && generation === loadGenerationRef.current) {
          setLoading(false);
        }
      },
    );
  };

  const serverIdsKey = useMemo(
    () => servers.map((server) => server.id).join("\0"),
    [servers],
  );

  useEffect(() => {
    let cancelled = false;
    void load({ cancelled: () => cancelled });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- serverIdsKey, not servers ref
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
    await runWithFinally(
      async () => {
        const result = await window.api.setBackupPolicy(serverId, draft);
        if (!result.ok) {
          showOperatorError(
            result.error ?? "Could not save backup policy",
            "Could not save backup settings",
          );
          return;
        }
        showOperatorToast({
          title: "Saved",
          message: "Saved backup settings for the selected server.",
        });
        await load({ quiet: true });
      },
      () => {
        setBusyId(null);
      },
    );
  };

  const browseBackupDir = async (server: ServerProfile) => {
    const draft = drafts[server.id];
    if (draft === undefined) return;
    setBrowsingId(server.id);
    await runWithFinally(
      async () => {
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
      },
      () => {
        setBrowsingId(null);
      },
    );
  };

  const openDestination = async (serverId: string) => {
    setBusyId(serverId);
    await runWithFinally(
      async () => {
        const result = await window.api.openBackupRoot(serverId);
        if (!result.ok) {
          showOperatorError(result.error ?? "Could not open backup destination");
        }
      },
      () => {
        setBusyId(null);
      },
    );
  };

  const saveDiskSettings = async () => {
    if (diskDraft === null) return;
    setDiskBusy(true);
    await runWithFinally(
      async () => {
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
      },
      () => {
        setDiskBusy(false);
      },
    );
  };

  const dismissFleetAlert = async (alert: { id: string; fingerprint: string }) => {
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
    await runWithFinally(
      async () => {
        const result = await window.api.previewBackupCleanup(buildCleanupPayload());
        if (!result.ok) {
          setCleanupPreview(null);
          showOperatorError(result.error ?? "Could not preview cleanup");
          return;
        }
        setCleanupPreview(result.data);
      },
      () => {
        setCleanupBusy(false);
      },
    );
  };

  const confirmCleanup = async () => {
    if (cleanupPreview === null || cleanupPreview.items.length === 0) return;
    setCleanupBusy(true);
    await runWithFinally(
      async () => {
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
          message: `Cleanup removed ${result.data.deleted} backup${result.data.deleted === 1 ? "" : "s"} (${formatBackupBytes(result.data.freedBytes)}).`,
        });
        await load();
      },
      () => {
        setCleanupBusy(false);
      },
    );
  };

  const serverById = useMemo(() => {
    return new Map(servers.map((server) => [server.id, server]));
  }, [servers]);

  const openCleanupModal = () => {
    setCleanupOptions(DEFAULT_CLEANUP);
    setCleanupPreview(null);
    setCleanupOpen(true);
  };

  const openCleanupModalFromToolbar = () => {
    setCleanupOptions(DEFAULT_CLEANUP);
    setCleanupPreview(null);
    setOlderThanEnabled(false);
    setKeepLastEnabled(false);
    setCleanupOpen(true);
  };

  return {
    summary,
    drafts,
    setDrafts,
    expandedId,
    setExpandedId,
    loading,
    busyId,
    browsingId,
    healthFilter,
    setHealthFilter,
    diskModalOpen,
    setDiskModalOpen,
    diskDraft,
    setDiskDraft,
    diskBusy,
    cleanupOpen,
    setCleanupOpen,
    cleanupOptions,
    setCleanupOptions,
    cleanupPreview,
    cleanupBusy,
    olderThanEnabled,
    setOlderThanEnabled,
    olderThanDays,
    setOlderThanDays,
    keepLastEnabled,
    setKeepLastEnabled,
    keepLastPerKind,
    setKeepLastPerKind,
    filteredServers,
    backupFleetQuiet,
    serverById,
    load,
    savePolicy,
    browseBackupDir,
    openDestination,
    saveDiskSettings,
    dismissFleetAlert,
    openCleanupModal,
    openCleanupModalFromToolbar,
    runPreviewCleanup,
    confirmCleanup,
    clearCleanupPreview: () => setCleanupPreview(null),
  };
}
