import { Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import { runWithFinally } from "@renderer/shared/async/runWithFinally";
import type { ServerOperationalLogs } from "@shared/types";
import { showOperatorToast } from "@ui/operatorToast";
import {
  createElement,
  type ComponentType,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { formatUpdateJobLabel, replaceRuntimeLogs } from "./serverLogsFormat";

interface ServerLogsPanelActionOptions {
  serverId: string;
  logs: ServerOperationalLogs | null;
  selectedUpdateFile: string | null;
  selectedUpdateInfo: ServerOperationalLogs["updateFiles"][number] | null;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setLogs: Dispatch<SetStateAction<ServerOperationalLogs | null>>;
  setHighlightedEventId: Dispatch<SetStateAction<number | null>>;
  setExpandedEventId: Dispatch<SetStateAction<number | null>>;
  setSelectedUpdateFile: Dispatch<SetStateAction<string | null>>;
  setUpdateContent: Dispatch<SetStateAction<string>>;
  runtimeRevisionRef: { current: number };
  load: (serverId: string) => Promise<ServerOperationalLogs | void>;
}

function confirmationText(children: ReactNode) {
  const ConfirmationText = Text as ComponentType<{
    size?: string;
    children?: ReactNode;
  }>;
  return createElement(ConfirmationText, { size: "sm" }, children);
}

export function createServerLogsPanelActions(
  options: ServerLogsPanelActionOptions,
) {
  const {
    serverId,
    logs,
    selectedUpdateFile,
    selectedUpdateInfo,
    setBusy,
    setError,
    setLogs,
    setHighlightedEventId,
    setExpandedEventId,
    setSelectedUpdateFile,
    setUpdateContent,
    runtimeRevisionRef,
    load,
  } = options;

  const exportLogs = async () => {
    setBusy(true);
    setError(null);
    await runWithFinally(
      async () => {
        const result = await window.api.exportServerLogs(serverId);
        if (!result.ok) {
          setError(result.error ?? "Could not export logs");
          return;
        }
        if (result.data !== null) {
          showOperatorToast({
            title: "Logs",
            message: `Exported to ${result.data}`,
            autoClose: 8000,
          });
        }
      },
      () => setBusy(false),
    );
  };

  const openInExternalViewer = async () => {
    if (selectedUpdateFile === null) return;
    setBusy(true);
    setError(null);
    await runWithFinally(
      async () => {
        const result = await window.api.openServerUpdateLogFile(
          serverId,
          selectedUpdateFile,
        );
        if (!result.ok) {
          setError(result.error ?? "Could not open the log externally");
        }
      },
      () => setBusy(false),
    );
  };

  const confirmClearEvents = () => {
    const count = logs?.events.length ?? 0;
    if (count === 0) return;
    modals.openConfirmModal({
      title: "Clear events?",
      children: confirmationText([
        "Permanently delete ",
        createElement("strong", { key: "count" }, count),
        ` event${count === 1 ? "" : "s"} for this server? This cannot be undone.`,
      ]),
      labels: { confirm: "Clear events", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: () => {
        setBusy(true);
        void runWithFinally(
          async () => {
            setError(null);
            const result = await window.api.clearServerEvents(serverId);
            if (!result.ok) {
              setError(result.error ?? "Could not clear events");
              return;
            }
            setHighlightedEventId(null);
            setExpandedEventId(null);
            await load(serverId);
            showOperatorToast({
              title: "Logs",
              message: `Cleared ${result.data} event${result.data === 1 ? "" : "s"}.`,
            });
          },
          () => setBusy(false),
        );
      },
    });
  };

  const confirmClearRuntime = () => {
    if ((logs?.runtimeLogLines.length ?? 0) === 0) return;
    modals.openConfirmModal({
      title: "Clear runtime log?",
      children: confirmationText(
        "Clear captured console output for this server from the manager buffer? New lines will appear again while the process is running.",
      ),
      labels: { confirm: "Clear runtime", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: () => {
        setBusy(true);
        void runWithFinally(
          async () => {
            setError(null);
            const result = await window.api.clearServerRuntimeLog(serverId);
            if (!result.ok) {
              setError(result.error ?? "Could not clear runtime log");
              return;
            }
            runtimeRevisionRef.current += 1;
            setLogs((prev) => replaceRuntimeLogs(prev, serverId, []));
            await load(serverId);
            showOperatorToast({ title: "Logs", message: "Runtime log cleared." });
          },
          () => setBusy(false),
        );
      },
    });
  };

  const confirmClearUpdateLogs = () => {
    const count = logs?.updateFiles.length ?? 0;
    if (count === 0) return;
    modals.openConfirmModal({
      title: "Clear update logs?",
      children: confirmationText([
        "Permanently delete ",
        createElement("strong", { key: "count" }, count),
        ` update log${count === 1 ? "" : "s"} for this server? This cannot be undone.`,
      ]),
      labels: { confirm: "Clear update logs", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: () => {
        setBusy(true);
        void runWithFinally(
          async () => {
            setError(null);
            const result = await window.api.clearServerUpdateLogs(serverId);
            if (!result.ok) {
              setError(result.error ?? "Could not clear update logs");
              return;
            }
            setSelectedUpdateFile(null);
            setUpdateContent("");
            await load(serverId);
            showOperatorToast({
              title: "Logs",
              message: `Deleted ${result.data} update log${result.data === 1 ? "" : "s"}.`,
            });
          },
          () => setBusy(false),
        );
      },
    });
  };

  const confirmDeleteSelectedUpdate = () => {
    if (selectedUpdateFile === null) return;
    const fileName = selectedUpdateFile;
    const stamp = selectedUpdateInfo?.modifiedAt ?? new Date().toISOString();
    modals.openConfirmModal({
      title: "Delete this update log?",
      children: confirmationText([
        "Permanently delete the job log ",
        createElement(
          "strong",
          { key: "name" },
          formatUpdateJobLabel(fileName, stamp).title,
        ),
        "? This cannot be undone.",
      ]),
      labels: { confirm: "Delete log", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: () => {
        setBusy(true);
        void runWithFinally(
          async () => {
            setError(null);
            const result = await window.api.deleteServerUpdateLog(serverId, fileName);
            if (!result.ok) {
              setError(result.error ?? "Could not delete update log");
              return;
            }
            setSelectedUpdateFile(null);
            setUpdateContent("");
            await load(serverId);
            showOperatorToast({ title: "Logs", message: "Update log deleted." });
          },
          () => setBusy(false),
        );
      },
    });
  };

  const confirmClearBackups = () => {
    const all = logs?.backups ?? [];
    const deletable = all.filter((backup) => backup.status !== "running");
    const ids = deletable.map((backup) => backup.id);
    const count = deletable.length;
    const skippedRunning = all.length - count;
    if (count === 0) {
      setError(
        skippedRunning > 0
          ? "Cannot delete backups while one is still running."
          : "No backups to delete",
      );
      return;
    }
    modals.openConfirmModal({
      title: "Delete all listed backups?",
      children: confirmationText([
        "Permanently delete ",
        createElement("strong", { key: "count" }, count),
        ` backup archive${count === 1 ? "" : "s"} from disk and the database? This cannot be undone.`,
        skippedRunning > 0
          ? ` ${skippedRunning} running backup${skippedRunning === 1 ? "" : "s"} will be skipped.`
          : "",
      ]),
      labels: { confirm: "Delete backups", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: () => {
        setBusy(true);
        void runWithFinally(
          async () => {
            setError(null);
            const result = await window.api.deleteBackups(serverId, ids);
            if (!result.ok) {
              setError(result.error ?? "Could not delete backups");
              return;
            }
            await load(serverId);
            showOperatorToast({
              title: "Logs",
              message: `Deleted ${result.data} backup${result.data === 1 ? "" : "s"}.`,
            });
          },
          () => setBusy(false),
        );
      },
    });
  };

  const confirmDeleteBackup = (backupId: string, label: string) => {
    modals.openConfirmModal({
      title: "Delete backup?",
      children: confirmationText([
        "Permanently delete ",
        createElement("strong", { key: "label" }, label),
        " from disk and the database? This cannot be undone.",
      ]),
      labels: { confirm: "Delete", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: () => {
        setBusy(true);
        void runWithFinally(
          async () => {
            setError(null);
            const result = await window.api.deleteBackups(serverId, [backupId]);
            if (!result.ok) {
              setError(result.error ?? "Could not delete backup");
              return;
            }
            await load(serverId);
            showOperatorToast({ title: "Logs", message: "Backup deleted." });
          },
          () => setBusy(false),
        );
      },
    });
  };

  return {
    exportLogs,
    openInExternalViewer,
    confirmClearEvents,
    confirmClearRuntime,
    confirmClearUpdateLogs,
    confirmDeleteSelectedUpdate,
    confirmClearBackups,
    confirmDeleteBackup,
  };
}
