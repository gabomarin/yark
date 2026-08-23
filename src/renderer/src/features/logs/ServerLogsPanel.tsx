import { ClockCounterClockwise, DownloadSimple } from "@phosphor-icons/react";
import { Alert, Button, Group, Stack, Tabs, Text, Title } from "@mantine/core";
import { modals } from "@mantine/modals";
import { runWithFinally } from "@renderer/shared/async/runWithFinally";
import type { ServerOperationalLogs, ServerProfile } from "@shared/types";
import type { ReactElement } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { showOperatorToast } from "@ui/operatorToast";
import { LogsBackupsTab } from "./components/LogsBackupsTab/LogsBackupsTab";
import { LogsEventsTab } from "./components/LogsEventsTab/LogsEventsTab";
import { LogsClearAction } from "./components/LogsPanelChrome/LogsPanelChrome";
import { LogsUpdatesTab } from "./components/LogsUpdatesTab/LogsUpdatesTab";
import classes from "./LogsPage.module.css";
import { RuntimeLogSection } from "./RuntimeLogSection";
import {
  formatUpdateJobLabel,
  preserveNewerRuntimeLogs,
  replaceRuntimeLogs,
  type RuntimeLogSourceFilter,
} from "./serverLogsFormat";

type LogsSection = "events" | "runtime" | "updates" | "backups";

export interface ServerLogsFocus {
  section?: LogsSection;
  eventId?: number;
  updateFileName?: string;
  /** Highlights a backup row under Logs → Backups (failed fleet alerts). */
  backupId?: string;
}

interface Props {
  server: ServerProfile;
  embedded?: boolean;
  focus?: ServerLogsFocus | null;
  /** Called after focus has been applied (so parent can clear one-shot focus). */
  onFocusConsumed?: () => void;
}

export function ServerLogsPanel(props: Props): ReactElement {
  const { server, focus, onFocusConsumed } = props;
  const [activeSection, setActiveSection] = useState<LogsSection>(
    focus?.section ?? "events",
  );
  const [logs, setLogs] = useState<ServerOperationalLogs | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedUpdateFile, setSelectedUpdateFile] = useState<string | null>(null);
  const [updateContent, setUpdateContent] = useState("");
  const [highlightedEventId, setHighlightedEventId] = useState<number | null>(null);
  const [highlightedBackupId, setHighlightedBackupId] = useState<string | null>(null);
  const [expandedEventId, setExpandedEventId] = useState<number | null>(null);
  const [runtimeSourceFilter, setRuntimeSourceFilter] =
    useState<RuntimeLogSourceFilter>("all");
  const focusKeyRef = useRef<string | null>(null);
  const autoScrollDoneRef = useRef(false);
  const updateLoadGenRef = useRef(0);
  const loadGenRef = useRef(0);
  const runtimePollGenRef = useRef(0);
  const runtimeRevisionRef = useRef(0);
  const applyLoadedLogs = useCallback((data: ServerOperationalLogs, revision: number) => setLogs(
    (prev) => preserveNewerRuntimeLogs(data, prev, runtimeRevisionRef.current !== revision),
  ), []);
  const clearUpdateContent = useCallback(() => {
    updateLoadGenRef.current += 1;
    setSelectedUpdateFile(null);
    setUpdateContent("");
    setBusy(false);
  }, []);

  const openUpdateLog = useCallback(async (serverId: string, fileName: string) => {
    const gen = ++updateLoadGenRef.current;
    setBusy(true);
    setError(null);
    await runWithFinally(
      async () => {
        // Cap read size so a single job log cannot dominate renderer memory.
        const result = await window.api.readServerUpdateLog(serverId, fileName, 150_000);
        if (gen !== updateLoadGenRef.current) return;
        if (!result.ok) {
          setError(result.error ?? "Could not open update log");
          return;
        }
        setSelectedUpdateFile(fileName);
        setUpdateContent(result.data);
      },
      () => {
        if (gen === updateLoadGenRef.current) {
          setBusy(false);
        }
      },
    );
  }, []);

  const load = useCallback(async (serverId: string, options?: { quiet?: boolean }) => {
    const quiet = options?.quiet === true;
    const gen = ++loadGenRef.current;
    const runtimeRevision = runtimeRevisionRef.current;
    if (!quiet) {
      setLoading(true);
      setError(null);
      clearUpdateContent();
    }
    return runWithFinally(
      async () => {
        const result = await window.api.listServerLogs(serverId);
        if (gen !== loadGenRef.current) return;
        if (!result.ok) {
          if (!quiet) {
            setLogs(null);
            setError(result.error ?? "Could not load logs");
          }
          return;
        }
        if (result.data.serverId !== serverId) return;
        applyLoadedLogs(result.data, runtimeRevision);
        return result.data;
      },
      () => {
        if (!quiet && gen === loadGenRef.current) {
          setLoading(false);
        }
      },
    );
  }, [clearUpdateContent, applyLoadedLogs]);

  const refreshRuntime = useCallback(async (serverId: string) => {
    const gen = ++runtimePollGenRef.current;
    if (typeof window.api.getServerRuntimeLog !== "function") {
      await load(serverId, { quiet: true });
      return;
    }
    const result = await window.api.getServerRuntimeLog(serverId);
    if (gen !== runtimePollGenRef.current) return;
    if (!result.ok) return;
    if (result.data.serverId !== serverId) return;
    runtimeRevisionRef.current += 1;
    setLogs((prev) =>
      replaceRuntimeLogs(prev, serverId, result.data.runtimeLogLines),
    );
  }, [load]);

  useEffect(() => {
    setRuntimeSourceFilter("all");
  }, [props.server.id]);

  useEffect(() => {
    let alive = true;
    const serverId = props.server.id;
    const gen = ++loadGenRef.current;
    const runtimeRevision = ++runtimeRevisionRef.current;
    void runWithFinally(
      async () => {
        setLoading(true);
        setError(null);
        clearUpdateContent();
        setHighlightedEventId(null);
        setHighlightedBackupId(null);
        setExpandedEventId(null);
        focusKeyRef.current = null;
        autoScrollDoneRef.current = false;
        const result = await window.api.listServerLogs(serverId);
        if (!alive || gen !== loadGenRef.current) return;
        if (!result.ok) {
          setLogs(null);
          setError(result.error ?? "Could not load logs");
          return;
        }
        if (result.data.serverId !== serverId) return;
        applyLoadedLogs(result.data, runtimeRevision);
      },
      () => {
        if (alive && gen === loadGenRef.current) {
          setLoading(false);
        }
      },
    );
    return () => {
      alive = false;
      clearUpdateContent();
    };
  }, [props.server.id, applyLoadedLogs, clearUpdateContent]);

  useEffect(() => {
    if (typeof window.api.onBackupsChanged !== "function") return undefined;
    return window.api.onBackupsChanged((payload) => {
      if (payload.serverId !== server.id) return;
      void load(server.id);
    });
  }, [server.id, load]);

  // Live refresh Runtime while that tab is open (lightweight runtime-only IPC).
  useEffect(() => {
    if (activeSection !== "runtime") return undefined;
    const serverId = server.id;
    const timer = window.setInterval(() => {
      void refreshRuntime(serverId);
    }, 1500);
    return () => {
      window.clearInterval(timer);
      runtimePollGenRef.current += 1;
    };
  }, [server.id, activeSection, refreshRuntime]);

  // Drop large update-log strings when leaving the Updates section.
  useEffect(() => {
    if (activeSection === "updates") return;
    clearUpdateContent();
  }, [activeSection, clearUpdateContent]);

  useEffect(() => {
    if (focus == null) {
      focusKeyRef.current = null;
      return;
    }
    const key = `${server.id}:${focus.section ?? ""}:${focus.eventId ?? ""}:${focus.updateFileName ?? ""}:${focus.backupId ?? ""}`;
    if (focusKeyRef.current === key) return;
    focusKeyRef.current = key;
    autoScrollDoneRef.current = false;

    // eventId targets an AppEvent row in Events. Prefer that over a file section.
    const section: LogsSection =
      typeof focus.eventId === "number"
        ? "events"
        : (focus.section ?? "events");
    setActiveSection(section);
    if (typeof focus.eventId === "number") {
      setHighlightedEventId(focus.eventId);
      setExpandedEventId(focus.eventId);
      setHighlightedBackupId(null);
    } else {
      setHighlightedEventId(null);
      // Provisional until logs load; refined to newest failed when backupId omitted.
      setHighlightedBackupId(section === "backups" ? (focus.backupId ?? null) : null);
    }

    void (async () => {
      const data = logs?.serverId === server.id ? logs : await load(server.id);
      // A newer focus effect may have started while we awaited load/openUpdateLog.
      if (focusKeyRef.current !== key) return;
      if (data == null) {
        onFocusConsumed?.();
        return;
      }

      if (section === "updates") {
        const preferred =
          focus.updateFileName ??
          data.updateFiles.find((file) => file.status === "failed")?.fileName ??
          data.updateFiles[0]?.fileName ??
          null;
        if (preferred !== null) {
          await openUpdateLog(server.id, preferred);
          if (focusKeyRef.current !== key) return;
        }
      }

      if (section === "backups") {
        const preferred =
          focus.backupId ??
          data.backups.find((backup) => backup.status === "failed")?.id ??
          null;
        setHighlightedBackupId(preferred);
      } else if (typeof focus.eventId !== "number") {
        setHighlightedBackupId(null);
      }

      onFocusConsumed?.();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- logs is read at execution time, not as a reactive trigger
  }, [focus, server.id, load, openUpdateLog, onFocusConsumed]);

  useEffect(() => {
    if (highlightedEventId === null || activeSection !== "events") return;
    if (autoScrollDoneRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      const node = document.querySelector(
        `[data-log-event-id="${highlightedEventId}"]`,
      ) as HTMLElement | null;
      if (node === null) return;
      node.scrollIntoView({ block: "center", behavior: "smooth" });
      autoScrollDoneRef.current = true;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [highlightedEventId, logs, activeSection]);

  useEffect(() => {
    if (highlightedBackupId === null || activeSection !== "backups") return;
    if (autoScrollDoneRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      const node = document.querySelector(
        `[data-backup-id="${CSS.escape(highlightedBackupId)}"]`,
      ) as HTMLElement | null;
      if (node === null) return;
      node.scrollIntoView({ block: "center", behavior: "smooth" });
      autoScrollDoneRef.current = true;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [highlightedBackupId, logs, activeSection]);

  const exportLogs = async () => {
    setBusy(true);
    setError(null);
    await runWithFinally(
      async () => {
        const result = await window.api.exportServerLogs(props.server.id);
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
      () => {
        setBusy(false);
      },
    );
  };

  const openInExternalViewer = async () => {
    if (selectedUpdateFile === null) return;
    setBusy(true);
    setError(null);
    await runWithFinally(
      async () => {
        const result = await window.api.openServerUpdateLogFile(
          props.server.id,
          selectedUpdateFile,
        );
        if (!result.ok) {
          setError(result.error ?? "Could not open the log externally");
        }
      },
      () => {
        setBusy(false);
      },
    );
  };

  const selectedUpdateInfo =
    logs?.updateFiles.find((file) => file.fileName === selectedUpdateFile) ?? null;

  const confirmClearEvents = () => {
    const count = logs?.events.length ?? 0;
    if (count === 0) return;
    modals.openConfirmModal({
      title: "Clear events?",
      children: (
        <Text size="sm">
          Permanently delete <strong>{count}</strong> event
          {count === 1 ? "" : "s"} for this server? This cannot be undone.
        </Text>
      ),
      labels: { confirm: "Clear events", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: () => {
        setBusy(true);
        void runWithFinally(
          async () => {
            setError(null);
            const result = await window.api.clearServerEvents(props.server.id);
            if (!result.ok) {
              setError(result.error ?? "Could not clear events");
              return;
            }
            setHighlightedEventId(null);
            setExpandedEventId(null);
            await load(props.server.id);
            showOperatorToast({
              title: "Logs",
              message: `Cleared ${result.data} event${result.data === 1 ? "" : "s"}.`,
            });
          },
          () => {
            setBusy(false);
          },
        );
      },
    });
  };

  const confirmClearRuntime = () => {
    if ((logs?.runtimeLogLines.length ?? 0) === 0) return;
    modals.openConfirmModal({
      title: "Clear runtime log?",
      children: (
        <Text size="sm">
          Clear captured console output for this server from the manager buffer?
          New lines will appear again while the process is running.
        </Text>
      ),
      labels: { confirm: "Clear runtime", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: () => {
        setBusy(true);
        void runWithFinally(
          async () => {
            setError(null);
            const result = await window.api.clearServerRuntimeLog(props.server.id);
            if (!result.ok) {
              setError(result.error ?? "Could not clear runtime log");
              return;
            }
            runtimeRevisionRef.current += 1;
            setLogs((prev) => replaceRuntimeLogs(prev, props.server.id, []));
            await load(props.server.id);
            showOperatorToast({
              title: "Logs",
              message: "Runtime log cleared.",
            });
          },
          () => {
            setBusy(false);
          },
        );
      },
    });
  };

  const confirmClearUpdateLogs = () => {
    const count = logs?.updateFiles.length ?? 0;
    if (count === 0) return;
    modals.openConfirmModal({
      title: "Clear update logs?",
      children: (
        <Text size="sm">
          Permanently delete <strong>{count}</strong> update log
          {count === 1 ? "" : "s"} for this server? This cannot be undone.
        </Text>
      ),
      labels: { confirm: "Clear update logs", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: () => {
        setBusy(true);
        void runWithFinally(
          async () => {
            setError(null);
            const result = await window.api.clearServerUpdateLogs(props.server.id);
            if (!result.ok) {
              setError(result.error ?? "Could not clear update logs");
              return;
            }
            setSelectedUpdateFile(null);
            setUpdateContent("");
            await load(props.server.id);
            showOperatorToast({
              title: "Logs",
              message: `Deleted ${result.data} update log${result.data === 1 ? "" : "s"}.`,
            });
          },
          () => {
            setBusy(false);
          },
        );
      },
    });
  };

  const confirmDeleteSelectedUpdate = () => {
    if (selectedUpdateFile === null) return;
    const fileName = selectedUpdateFile;
    const stamp =
      selectedUpdateInfo?.modifiedAt ?? new Date().toISOString();
    modals.openConfirmModal({
      title: "Delete this update log?",
      children: (
        <Text size="sm">
          Permanently delete the job log{" "}
          <strong>{formatUpdateJobLabel(fileName, stamp).title}</strong>? This
          cannot be undone.
        </Text>
      ),
      labels: { confirm: "Delete log", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: () => {
        setBusy(true);
        void runWithFinally(
          async () => {
            setError(null);
            const result = await window.api.deleteServerUpdateLog(
              props.server.id,
              fileName,
            );
            if (!result.ok) {
              setError(result.error ?? "Could not delete update log");
              return;
            }
            setSelectedUpdateFile(null);
            setUpdateContent("");
            await load(props.server.id);
            showOperatorToast({
              title: "Logs",
              message: "Update log deleted.",
            });
          },
          () => {
            setBusy(false);
          },
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
      children: (
        <Text size="sm">
          Permanently delete <strong>{count}</strong> backup archive
          {count === 1 ? "" : "s"} from disk and the database? This cannot be
          undone.
          {skippedRunning > 0
            ? ` ${skippedRunning} running backup${skippedRunning === 1 ? "" : "s"} will be skipped.`
            : ""}
        </Text>
      ),
      labels: { confirm: "Delete backups", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: () => {
        setBusy(true);
        void runWithFinally(
          async () => {
            setError(null);
            const result = await window.api.deleteBackups(props.server.id, ids);
            if (!result.ok) {
              setError(result.error ?? "Could not delete backups");
              return;
            }
            await load(props.server.id);
            showOperatorToast({
              title: "Logs",
              message: `Deleted ${result.data} backup${result.data === 1 ? "" : "s"}.`,
            });
          },
          () => {
            setBusy(false);
          },
        );
      },
    });
  };

  const confirmDeleteBackup = (backupId: string, label: string) => {
    modals.openConfirmModal({
      title: "Delete backup?",
      children: (
        <Text size="sm">
          Permanently delete <strong>{label}</strong> from disk and the database?
          This cannot be undone.
        </Text>
      ),
      labels: { confirm: "Delete", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: () => {
        setBusy(true);
        void runWithFinally(
          async () => {
            setError(null);
            const result = await window.api.deleteBackups(props.server.id, [backupId]);
            if (!result.ok) {
              setError(result.error ?? "Could not delete backup");
              return;
            }
            await load(props.server.id);
            showOperatorToast({
              title: "Logs",
              message: "Backup deleted.",
            });
          },
          () => {
            setBusy(false);
          },
        );
      },
    });
  };

  const rootClass = props.embedded === true ? classes.embedded : classes.logsContent;

  return (
    <Stack gap="md" className={rootClass} data-server-logs-panel>
      <Group justify="space-between" align="center" wrap="wrap" gap="sm">
        <div>
          <Title order={props.embedded === true ? 4 : 3}>Logs</Title>
          <Text size="sm" c="dimmed">
            Diagnostic views for {props.server.name}. Use Events for manager
            history, Runtime for live console output, Updates for SteamCMD jobs,
            and Backups for archive history.
          </Text>
        </div>
        <Group gap="sm">
          <Button
            variant="default"
            leftSection={<ClockCounterClockwise size={16} />}
            onClick={() => void load(props.server.id)}
            disabled={loading || busy}
          >
            Reload
          </Button>
          <Button
            leftSection={<DownloadSimple size={16} />}
            onClick={() => void exportLogs()}
            disabled={loading || busy}
          >
            Export
          </Button>
        </Group>
      </Group>

      {error !== null && <Alert color="red">{error}</Alert>}

      <Tabs
        value={activeSection}
        onChange={(value) => setActiveSection((value as LogsSection) ?? "events")}
        keepMounted={false}
        className={classes.tabs}
      >
        <Tabs.List className={classes.tabList}>
          <Tabs.Tab value="events">Events</Tabs.Tab>
          <Tabs.Tab value="runtime">Runtime</Tabs.Tab>
          <Tabs.Tab value="updates">Updates</Tabs.Tab>
          <Tabs.Tab value="backups">Backups</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="events" className={classes.tabPanel}>
          <LogsEventsTab
            loading={loading}
            busy={busy}
            logs={logs}
            highlightedEventId={highlightedEventId}
            expandedEventId={expandedEventId}
            onExpandedEventIdChange={setExpandedEventId}
            onClearEvents={confirmClearEvents}
          />
        </Tabs.Panel>

        <Tabs.Panel value="runtime" className={classes.tabPanel}>
          <RuntimeLogSection
            loading={loading}
            runtimeLogLines={logs?.runtimeLogLines ?? null}
            sourceFilter={runtimeSourceFilter}
            onSourceFilterChange={setRuntimeSourceFilter}
            clearAction={
              <LogsClearAction
                label="Clear captured runtime console output"
                onClick={confirmClearRuntime}
                disabled={
                  loading ||
                  busy ||
                  logs === null ||
                  logs.runtimeLogLines.length === 0
                }
              />
            }
          />
        </Tabs.Panel>

        <Tabs.Panel value="updates" className={classes.tabPanel}>
          <LogsUpdatesTab
            loading={loading}
            busy={busy}
            logs={logs}
            serverId={props.server.id}
            selectedUpdateFile={selectedUpdateFile}
            updateContent={updateContent}
            selectedUpdateInfo={selectedUpdateInfo}
            onOpenUpdateLog={(serverId, fileName) => void openUpdateLog(serverId, fileName)}
            onClearUpdateLogs={confirmClearUpdateLogs}
            onOpenInExternalViewer={() => void openInExternalViewer()}
            onDeleteSelectedUpdate={confirmDeleteSelectedUpdate}
          />
        </Tabs.Panel>

        <Tabs.Panel value="backups" className={classes.tabPanel}>
          <LogsBackupsTab
            loading={loading}
            busy={busy}
            logs={logs}
            highlightedBackupId={highlightedBackupId}
            onClearBackups={confirmClearBackups}
            onDeleteBackup={confirmDeleteBackup}
          />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
