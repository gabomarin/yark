import { runWithFinally } from "@renderer/shared/async/runWithFinally";
import { playerBackupDisplayName } from "@shared/backup-player-meta";
import type {
  BackupKind,
  BackupRecord,
  ServerProfile,
} from "@shared/types";
import {
  dangerConfirmBody,
  openDangerConfirmModal,
} from "@ui/DangerConfirmModal/openDangerConfirmModal";
import { showOperatorError, showOperatorToast } from "@ui/operatorToast";
import {
  createElement,
  type Dispatch,
  type SetStateAction,
} from "react";
import { runBackupExport, runBackupImport } from "../backupPortability";
import { formatBackupDetails } from "../formatBackupDetails";
import { kindLabel, type DraftPolicy } from "../model/serverBackupPanelModel";

export type BackupBusyOp = "create" | "import" | "export" | "other";

export function showBackupToast(
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

export function showBackupError(message: string): void {
  showOperatorError(message, "Backups");
}

interface BackupPanelActionOptions {
  server: ServerProfile;
  activeKind: BackupKind;
  actionableSelectedIds: string[];
  draftPolicy: DraftPolicy | null;
  restoreTarget: BackupRecord | null;
  restoreProfilesTribes: boolean;
  opsLocked: boolean;
  opsLockReason?: string;
  busyOp: BackupBusyOp | null;
  setBusyOp: Dispatch<SetStateAction<BackupBusyOp | null>>;
  setBrowsingDir: Dispatch<SetStateAction<boolean>>;
  setDraftPolicy: Dispatch<SetStateAction<DraftPolicy | null>>;
  setSelectedIds: Dispatch<SetStateAction<string[]>>;
  setRestoreTarget: Dispatch<SetStateAction<BackupRecord | null>>;
  setRestoreProfilesTribes: Dispatch<SetStateAction<boolean>>;
  load: (serverId: string, options?: { quiet?: boolean }) => Promise<void>;
}

export function createServerBackupPanelActions(
  options: BackupPanelActionOptions,
) {
  const {
    server,
    activeKind,
    actionableSelectedIds,
    draftPolicy,
    restoreTarget,
    restoreProfilesTribes,
    opsLocked,
    opsLockReason,
    busyOp,
    setBusyOp,
    setBrowsingDir,
    setDraftPolicy,
    setSelectedIds,
    setRestoreTarget,
    setRestoreProfilesTribes,
    load,
  } = options;
  const activeKindLabel = kindLabel(activeKind);

  const createBackup = async () => {
    setBusyOp("create");
    await runWithFinally(
      async () => {
        const result = await window.api.createManualBackup(server.id, [activeKind]);
        if (!result.ok) {
          showBackupError(result.error ?? "Could not create backup");
          return;
        }
        await load(server.id);
        showBackupToast(`${activeKindLabel} backup completed.`);
      },
      () => setBusyOp(null),
    );
  };

  const browseBackupDir = async () => {
    if (draftPolicy === null) return;
    setBrowsingDir(true);
    await runWithFinally(
      async () => {
        const result = await window.api.pickPath(
          "directory",
          draftPolicy.backupDir ?? server.installDir,
          "Choose backup destination",
        );
        if (!result.ok) {
          showBackupError(result.error ?? "Could not open folder picker");
        } else if (result.data !== null) {
          setDraftPolicy({ ...draftPolicy, backupDir: result.data });
        }
      },
      () => setBrowsingDir(false),
    );
  };

  const openDestination = () => runBusy(async () => {
    const result = await window.api.openBackupRoot(server.id);
    if (!result.ok) {
      showBackupError(result.error ?? "Could not open backup destination");
    }
  });

  const openBackupFolder = (backupId: string) => runBusy(async () => {
    const result = await window.api.openBackupFolder(server.id, backupId);
    if (!result.ok) showBackupError(result.error ?? "Could not open backup folder");
  });

  function runBusy(operation: () => Promise<void>): Promise<void> {
    setBusyOp("other");
    return runWithFinally(operation, () => setBusyOp(null));
  }

  const exportBackup = async (backup: BackupRecord) => {
    setBusyOp("export");
    await runWithFinally(
      () => runBackupExport({
        serverId: server.id,
        serverName: server.name,
        backup,
        onError: showBackupError,
        onSuccess: (path) => showBackupToast(`Exported to ${path}`),
      }),
      () => setBusyOp(null),
    );
  };

  const importBackup = async () => {
    setBusyOp("import");
    await runWithFinally(
      () => runBackupImport({
        serverId: server.id,
        kind: activeKind,
        kindLabel: activeKindLabel,
        onError: showBackupError,
        onSuccess: async () => {
          await load(server.id);
          showBackupToast(
            `Imported ${activeKindLabel.toLowerCase()} archive into backup history (not restored).`,
          );
        },
      }),
      () => setBusyOp(null),
    );
  };

  const deleteBackupsByIds = (backupIds: string[]) => runBusy(async () => {
    const result = await window.api.deleteBackups(server.id, backupIds);
    if (!result.ok) {
      showBackupError(result.error ?? "Could not delete backups");
      return;
    }
    setSelectedIds((previous) =>
      previous.filter((id) => !backupIds.includes(id)),
    );
    await load(server.id);
    showBackupToast(`Deleted ${result.data} backup${result.data === 1 ? "" : "s"}.`);
  });

  const confirmDeleteSelected = () => {
    if (actionableSelectedIds.length === 0) return;
    const ids = [...actionableSelectedIds];
    const count = ids.length;
    openDangerConfirmModal({
      title: `Delete selected ${activeKindLabel.toLowerCase()} backups?`,
      children: dangerConfirmBody([
        "Permanently delete ",
        createElement("strong", { key: "count" }, count),
        ` ${activeKindLabel.toLowerCase()} backup${count === 1 ? "" : "s"} from disk and the database? This cannot be undone.`,
      ]),
      confirmLabel: "Delete",
      onConfirm: () => void deleteBackupsByIds(ids),
    });
  };

  const confirmClearFailed = () => {
    openDangerConfirmModal({
      title: `Clear failed ${activeKindLabel.toLowerCase()} backups?`,
      children: dangerConfirmBody(
        `Remove every failed ${activeKindLabel.toLowerCase()} record for this server from history. Archives are usually already missing; this is catalog cleanup.`,
      ),
      confirmLabel: "Clear failed",
      onConfirm: () => void runBusy(async () => {
        const result = await window.api.deleteFailedBackups(server.id, activeKind);
        if (!result.ok) {
          showBackupError(result.error ?? "Could not clear failed backups");
          return;
        }
        await load(server.id);
        showBackupToast(
          result.data === 0
            ? "No failed backup records to clear."
            : `Cleared ${result.data} failed backup record${result.data === 1 ? "" : "s"}.`,
        );
      }),
    });
  };

  const confirmDeleteOne = (backup: BackupRecord) => {
    if (backup.status === "running") return;
    const label =
      backup.kind === "players" ? playerBackupDisplayName(backup) : activeKindLabel;
    openDangerConfirmModal({
      title: `Delete ${label.toLowerCase()} backup?`,
      children: dangerConfirmBody([
        "Permanently delete this ",
        createElement("strong", { key: "label" }, label),
        " backup from disk and the database? This cannot be undone.",
      ]),
      confirmLabel: "Delete",
      onConfirm: () => void deleteBackupsByIds([backup.id]),
    });
  };

  const copyBackupDetails = async (backup: BackupRecord) => {
    try {
      await navigator.clipboard.writeText(
        formatBackupDetails({ id: server.id, name: server.name }, backup),
      );
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
    if (busyOp !== "other") setRestoreTarget(null);
  };

  const runRestore = async () => {
    if (restoreTarget === null) return;
    const backup = restoreTarget;
    await runBusy(async () => {
      const result = await window.api.restoreBackup(
        server.id,
        backup.id,
        backup.kind === "world" ? { restoreProfilesTribes } : undefined,
      );
      if (!result.ok) {
        showBackupError(result.error ?? "Could not restore backup");
        return;
      }
      setRestoreTarget(null);
      await load(server.id);
      showBackupToast(
        `${kindLabel(backup.kind)} backup restored. A pre-restore safety copy was kept.`,
      );
    });
  };

  return {
    createBackup,
    browseBackupDir,
    openDestination,
    openBackupFolder,
    exportBackup,
    importBackup,
    confirmDeleteSelected,
    confirmClearFailed,
    confirmDeleteOne,
    copyBackupDetails,
    confirmRestore,
    closeRestoreModal,
    runRestore,
  };
}
