import {
  ArrowSquareOut,
  Broom,
  ClockCounterClockwise,
  DownloadSimple,
  FileText,
  HardDrives,
  Trash,
} from "@phosphor-icons/react";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Stack,
  Tabs,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import type { ServerOperationalLogs, ServerProfile, ServerUpdateLogFile } from "@shared/types";
import { useEffect, useRef, useState } from "react";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";
import { EmptyState } from "@ui/EmptyState/EmptyState";
import { SelectableListRow } from "@ui/SelectableListRow/SelectableListRow";
import { EventDetailsBody } from "./EventDetailsBody";
import classes from "./LogsPage.module.css";

export type LogsSection = "events" | "runtime" | "updates" | "backups";

export interface ServerLogsFocus {
  section?: LogsSection;
  eventId?: number;
  updateFileName?: string;
}

interface Props {
  server: ServerProfile;
  embedded?: boolean;
  focus?: ServerLogsFocus | null;
  /** Called after focus has been applied (so parent can clear one-shot focus). */
  onFocusConsumed?: () => void;
}

function formatSize(sizeBytes: number): string {
  if (sizeBytes >= 1024 * 1024) {
    return `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  return `${(sizeBytes / 1024).toFixed(1)} KB`;
}

function formatDuration(durationMs: number | null): string {
  if (durationMs === null) return "—";
  const seconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes > 0) {
    return `${minutes}m ${rest}s`;
  }
  return `${rest}s`;
}

function statusColor(status: ServerUpdateLogFile["status"]): string {
  if (status === "success") return "green";
  if (status === "failed") return "red";
  return "gray";
}

function statusLabel(status: ServerUpdateLogFile["status"]): string {
  if (status === "success") return "Success";
  if (status === "failed") return "Failed";
  return "Unknown";
}

/** Prefer a readable stamp over the full `{uuid}-{iso}.log` filename. */
function formatUpdateJobLabel(fileName: string, modifiedAt: string): {
  title: string;
  subtitle: string;
} {
  const withoutExt = fileName.replace(/\.log$/i, "");
  const stampMatch = withoutExt.match(/(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})$/);
  const rawStamp = stampMatch?.[1];
  const subtitle =
    rawStamp !== undefined
      ? rawStamp.replace(
          /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})$/,
          "$1 $2:$3:$4",
        )
      : withoutExt.slice(-24);
  return {
    title: new Date(modifiedAt).toLocaleString(),
    subtitle,
  };
}

export function ServerLogsPanel(props: Props): JSX.Element {
  const [activeSection, setActiveSection] = useState<LogsSection>(
    props.focus?.section ?? "events",
  );
  const [logs, setLogs] = useState<ServerOperationalLogs | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [selectedUpdateFile, setSelectedUpdateFile] = useState<string | null>(null);
  const [updateContent, setUpdateContent] = useState("");
  const [highlightedEventId, setHighlightedEventId] = useState<number | null>(null);
  const [expandedEventId, setExpandedEventId] = useState<number | null>(null);
  const focusKeyRef = useRef<string | null>(null);
  const autoScrollDoneRef = useRef(false);
  const updateLoadGenRef = useRef(0);

  const clearUpdateContent = () => {
    updateLoadGenRef.current += 1;
    setSelectedUpdateFile(null);
    setUpdateContent("");
    setBusy(false);
  };

  const openUpdateLog = async (serverId: string, fileName: string) => {
    const gen = ++updateLoadGenRef.current;
    setBusy(true);
    setError(null);
    // Cap read size so a single job log cannot dominate renderer memory.
    const result = await window.api.readServerUpdateLog(serverId, fileName, 150_000);
    if (gen !== updateLoadGenRef.current) return;
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Could not open update log");
      return;
    }
    setSelectedUpdateFile(fileName);
    setUpdateContent(result.data);
  };

  const load = async (serverId: string) => {
    setLoading(true);
    setError(null);
    setInfo(null);
    clearUpdateContent();
    const result = await window.api.listServerLogs(serverId);
    setLoading(false);
    if (!result.ok) {
      setLogs(null);
      setError(result.error ?? "Could not load logs");
      return;
    }
    setLogs(result.data);
    return result.data;
  };

  useEffect(() => {
    let alive = true;
    void (async () => {
      setLoading(true);
      setError(null);
      setInfo(null);
      clearUpdateContent();
      setHighlightedEventId(null);
      setExpandedEventId(null);
      focusKeyRef.current = null;
      autoScrollDoneRef.current = false;
      const result = await window.api.listServerLogs(props.server.id);
      if (!alive) return;
      setLoading(false);
      if (!result.ok) {
        setLogs(null);
        setError(result.error ?? "Could not load logs");
        return;
      }
      setLogs(result.data);
    })();
    return () => {
      alive = false;
      clearUpdateContent();
    };
  }, [props.server.id]);

  useEffect(() => {
    if (typeof window.api.onBackupsChanged !== "function") return undefined;
    return window.api.onBackupsChanged((payload) => {
      if (payload.serverId !== props.server.id) return;
      void load(props.server.id);
    });
  }, [props.server.id]);

  // Drop large update-log strings when leaving the Updates section.
  useEffect(() => {
    if (activeSection === "updates") return;
    clearUpdateContent();
  }, [activeSection]);

  useEffect(() => {
    const focus = props.focus;
    if (focus == null) {
      focusKeyRef.current = null;
      return;
    }
    const key = `${props.server.id}:${focus.section ?? ""}:${focus.eventId ?? ""}:${focus.updateFileName ?? ""}`;
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
    } else {
      setHighlightedEventId(null);
    }

    void (async () => {
      const data = logs?.serverId === props.server.id ? logs : await load(props.server.id);
      if (data == null) {
        props.onFocusConsumed?.();
        return;
      }

      if (section === "updates") {
        const preferred =
          focus.updateFileName ??
          data.updateFiles.find((file) => file.status === "failed")?.fileName ??
          data.updateFiles[0]?.fileName ??
          null;
        if (preferred !== null) {
          await openUpdateLog(props.server.id, preferred);
        }
      }

      props.onFocusConsumed?.();
    })();
  }, [props.focus, props.server.id]);

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

  const exportLogs = async () => {
    setBusy(true);
    setError(null);
    setInfo(null);
    const result = await window.api.exportServerLogs(props.server.id);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Could not export logs");
      return;
    }
    if (result.data !== null) {
      setInfo(`Logs exported to: ${result.data}`);
    }
  };

  const openInExternalViewer = async () => {
    if (selectedUpdateFile === null) return;
    setBusy(true);
    setError(null);
    const result = await window.api.openServerUpdateLogFile(
      props.server.id,
      selectedUpdateFile,
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Could not open the log externally");
    }
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
        void (async () => {
          setBusy(true);
          setError(null);
          const result = await window.api.clearServerEvents(props.server.id);
          setBusy(false);
          if (!result.ok) {
            setError(result.error ?? "Could not clear events");
            return;
          }
          setHighlightedEventId(null);
          setExpandedEventId(null);
          await load(props.server.id);
          setInfo(`Cleared ${result.data} event${result.data === 1 ? "" : "s"}.`);
        })();
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
        void (async () => {
          setBusy(true);
          setError(null);
          const result = await window.api.clearServerRuntimeLog(props.server.id);
          setBusy(false);
          if (!result.ok) {
            setError(result.error ?? "Could not clear runtime log");
            return;
          }
          await load(props.server.id);
          setInfo("Runtime log cleared.");
        })();
      },
    });
  };

  const confirmClearUpdateLogs = () => {
    const count = logs?.updateFiles.length ?? 0;
    if (count === 0) return;
    modals.openConfirmModal({
      title: "Clear update job logs?",
      children: (
        <Text size="sm">
          Permanently delete <strong>{count}</strong> SteamCMD job log
          {count === 1 ? "" : "s"} for this server? This cannot be undone.
        </Text>
      ),
      labels: { confirm: "Clear update logs", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: () => {
        void (async () => {
          setBusy(true);
          setError(null);
          const result = await window.api.clearServerUpdateLogs(props.server.id);
          setBusy(false);
          if (!result.ok) {
            setError(result.error ?? "Could not clear update logs");
            return;
          }
          setSelectedUpdateFile(null);
          setUpdateContent("");
          await load(props.server.id);
          setInfo(`Deleted ${result.data} update log${result.data === 1 ? "" : "s"}.`);
        })();
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
        void (async () => {
          setBusy(true);
          setError(null);
          const result = await window.api.deleteServerUpdateLog(
            props.server.id,
            fileName,
          );
          setBusy(false);
          if (!result.ok) {
            setError(result.error ?? "Could not delete update log");
            return;
          }
          setSelectedUpdateFile(null);
          setUpdateContent("");
          await load(props.server.id);
          setInfo("Update log deleted.");
        })();
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
        void (async () => {
          setBusy(true);
          setError(null);
          const result = await window.api.deleteBackups(props.server.id, ids);
          setBusy(false);
          if (!result.ok) {
            setError(result.error ?? "Could not delete backups");
            return;
          }
          await load(props.server.id);
          setInfo(`Deleted ${result.data} backup${result.data === 1 ? "" : "s"}.`);
        })();
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
        void (async () => {
          setBusy(true);
          setError(null);
          const result = await window.api.deleteBackups(props.server.id, [backupId]);
          setBusy(false);
          if (!result.ok) {
            setError(result.error ?? "Could not delete backup");
            return;
          }
          await load(props.server.id);
          setInfo("Backup deleted.");
        })();
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

      {info !== null && <Alert color="blue">{info}</Alert>}
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
          <AppSurfaceCard fill className={classes.fillPanel}>
            <Stack gap="sm" className={classes.panelStack}>
              <TabIntro
                title="Events"
                purpose="Manager activity for this server: starts, stops, backups, updates, and errors."
                useWhen="You want a timeline of what the app did, or why an operation failed. Expand a row for cause and next steps."
                action={
                  <ClearAction
                    label="Clear all events for this server"
                    onClick={confirmClearEvents}
                    disabled={
                      loading || busy || logs === null || logs.events.length === 0
                    }
                  />
                }
              />
              {loading ? (
                <Text c="dimmed">Loading events...</Text>
              ) : logs === null || logs.events.length === 0 ? (
                <LogEmptyState
                  icon={<ClockCounterClockwise size={24} />}
                  title="No recent events"
                  description="Starts, stops, backup/update results, and errors will appear here as you operate this server."
                />
              ) : (
                <div className={classes.eventList} data-logs-scroll-region="events">
                  {logs.events.map((event) => {
                    const focused = highlightedEventId === event.id;
                    const expanded = expandedEventId === event.id;
                    return (
                      <button
                        key={event.id}
                        type="button"
                        data-log-event-id={event.id}
                        className={[
                          classes.eventRow,
                          classes.eventRowButton,
                          focused ? classes.eventRowFocused : "",
                          expanded ? classes.eventRowExpanded : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={() =>
                          setExpandedEventId((current) =>
                            current === event.id ? null : event.id,
                          )
                        }
                        aria-expanded={expanded}
                      >
                        <Group justify="space-between" align="flex-start" gap="sm" wrap="nowrap">
                          <div className={classes.eventRowMain}>
                            <Text size="sm" c="dimmed">
                              {new Date(event.createdAt).toLocaleString()}
                            </Text>
                            <Text size="sm" fw={expanded ? 600 : 400}>
                              {event.message}
                            </Text>
                          </div>
                          <Badge
                            color={
                              event.severity === "error"
                                ? "red"
                                : event.severity === "warning"
                                  ? "yellow"
                                  : "gray"
                            }
                            variant="light"
                          >
                            {event.severity}
                          </Badge>
                        </Group>
                        <EventDetailsBody event={event} expanded={expanded} />
                      </button>
                    );
                  })}
                </div>
              )}
            </Stack>
          </AppSurfaceCard>
        </Tabs.Panel>

        <Tabs.Panel value="runtime" className={classes.tabPanel}>
          <AppSurfaceCard fill className={classes.fillPanel}>
            <Stack gap="sm" className={classes.panelStack}>
              <TabIntro
                title="Runtime"
                purpose="Captured console output from the dedicated server process while it is managed here."
                useWhen="The server won’t start, crashes, or players report issues — look here for ASA/engine lines (mods, maps, fatal errors)."
                action={
                  <ClearAction
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
              {loading ? (
                <Text c="dimmed">Loading runtime log...</Text>
              ) : logs === null || logs.runtimeLogLines.length === 0 ? (
                <LogEmptyState
                  icon={<FileText size={24} />}
                  title="No runtime output"
                  description="Console output appears while the server is running (or after a recent run). Start the server to capture lines."
                />
              ) : (
                <pre className={classes.console} data-logs-scroll-region="runtime">
                  {logs.runtimeLogLines.join("\n")}
                </pre>
              )}
            </Stack>
          </AppSurfaceCard>
        </Tabs.Panel>

        <Tabs.Panel value="updates" className={classes.tabPanel}>
          <Stack gap="sm" className={classes.updatesStack}>
            <TabIntro
              title="Updates"
              purpose="SteamCMD install / update / verify job logs for this server (raw tool output)."
              useWhen="An update failed, files look wrong, or you need exit codes and SteamCMD stdout — pick a run on the left, read the log on the right."
              action={
                <ClearAction
                  label="Clear all SteamCMD job logs for this server"
                  onClick={confirmClearUpdateLogs}
                  disabled={
                    loading ||
                    busy ||
                    logs === null ||
                    logs.updateFiles.length === 0
                  }
                />
              }
            />
          <div className={classes.updatesLayout}>
            <AppSurfaceCard fill className={`${classes.historyPanel} ${classes.fillPanel}`}>
              <Stack gap="sm" className={classes.panelStack}>
                <Title order={4} className={classes.panelTitle}>
                  Job history
                </Title>
                {loading ? (
                  <Text c="dimmed">Loading history...</Text>
                ) : logs === null || logs.updateFiles.length === 0 ? (
                  <Text c="dimmed">
                    No SteamCMD job logs yet. Install, update, or verify files to create one.
                  </Text>
                ) : (
                  <div
                    className={classes.updateList}
                    data-logs-scroll-region="updates-list"
                  >
                    {logs.updateFiles.map((file) => {
                      const label = formatUpdateJobLabel(file.fileName, file.modifiedAt);
                      return (
                      <SelectableListRow
                        key={file.fileName}
                        selected={selectedUpdateFile === file.fileName}
                        onClick={() => void openUpdateLog(props.server.id, file.fileName)}
                        title={file.fileName}
                        trailing={
                          <Badge
                            color={statusColor(file.status)}
                            variant="light"
                            className={classes.updateStatus}
                          >
                            {statusLabel(file.status)}
                          </Badge>
                        }
                      >
                        <Text size="sm" fw={600} className={classes.updateTitle}>
                          {label.title}
                        </Text>
                        <Text size="xs" c="dimmed" className={classes.updateSubtitle}>
                          {label.subtitle}
                        </Text>
                      </SelectableListRow>
                      );
                    })}
                  </div>
                )}
              </Stack>
            </AppSurfaceCard>

            <AppSurfaceCard fill className={`${classes.detailPanel} ${classes.fillPanel}`}>
              <Stack gap="sm" className={classes.panelStack}>
                <Group
                  justify="space-between"
                  align="center"
                  wrap="wrap"
                  gap="sm"
                  className={classes.detailHeader}
                >
                  <Group gap="sm" wrap="nowrap">
                    <Title order={4} className={classes.panelTitle}>
                      Update details
                    </Title>
                    {selectedUpdateInfo !== null && (
                      <Badge
                        color={statusColor(selectedUpdateInfo.status)}
                        variant="light"
                      >
                        {selectedUpdateInfo.status}
                      </Badge>
                    )}
                  </Group>
                  {selectedUpdateInfo !== null && (
                    <Group gap="xs">
                      <Tooltip label="Open in external viewer">
                        <ActionIcon
                          variant="default"
                          aria-label="Open in external viewer"
                          onClick={() => void openInExternalViewer()}
                          disabled={busy}
                        >
                          <ArrowSquareOut size={16} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Delete this update log">
                        <ActionIcon
                          variant="light"
                          color="red"
                          aria-label="Delete this update log"
                          onClick={confirmDeleteSelectedUpdate}
                          disabled={busy}
                        >
                          <Trash size={16} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  )}
                </Group>

                {selectedUpdateInfo === null ? (
                  <Text c="dimmed">Select an update to see details.</Text>
                ) : (
                  <>
                    <div className={classes.detailsMeta}>
                      <DetailItem
                        label="Date"
                        value={new Date(selectedUpdateInfo.modifiedAt).toLocaleString()}
                        icon={<ClockCounterClockwise size={16} />}
                      />
                      <DetailItem
                        label="Duration"
                        value={formatDuration(selectedUpdateInfo.durationMs)}
                        icon={<ClockCounterClockwise size={16} />}
                      />
                      <DetailItem
                        label="Size"
                        value={formatSize(selectedUpdateInfo.sizeBytes)}
                        icon={<FileText size={16} />}
                      />
                    </div>
                    <pre
                      className={classes.console}
                      data-logs-scroll-region="update-content"
                    >
                      {updateContent.length > 0 ? updateContent : "Loading log content..."}
                    </pre>
                  </>
                )}
              </Stack>
            </AppSurfaceCard>
          </div>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="backups" className={classes.tabPanel}>
          <AppSurfaceCard fill className={classes.fillPanel}>
            <Stack gap="sm" className={classes.panelStack}>
              <TabIntro
                title="Backups"
                purpose="History of backup archives for this server (kind, status, path, size timing)."
                useWhen="You need to confirm a backup finished, find a path, or audit failures. Create/restore lives in the Backups workspace tab; you can also delete archives here."
                action={
                  <ClearAction
                    label="Delete all listed backup archives"
                    onClick={confirmClearBackups}
                    disabled={
                      loading ||
                      busy ||
                      logs === null ||
                      logs.backups.length === 0
                    }
                  />
                }
              />
              {loading ? (
                <Text c="dimmed">Loading backups...</Text>
              ) : logs === null || logs.backups.length === 0 ? (
                <LogEmptyState
                  icon={<HardDrives size={24} />}
                  title="No backups recorded"
                  description="Manual, scheduled, and automatic archives will list here after the first backup runs."
                />
              ) : (
                <div className={classes.eventList} data-logs-scroll-region="backups">
                  {logs.backups.map((backup) => (
                    <div key={backup.id} className={classes.eventRow}>
                      <Group justify="space-between" align="flex-start" gap="sm" wrap="nowrap">
                        <div className={classes.eventRowMain}>
                          <Text fw={600}>
                            {backup.kind} · {backup.type}
                          </Text>
                          <Text size="sm" c="dimmed">
                            {new Date(backup.createdAt).toLocaleString()} | {backup.status}
                          </Text>
                          <Text size="sm">{backup.path}</Text>
                        </div>
                        <Tooltip label={`Delete ${backup.kind} · ${backup.type} backup`}>
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            aria-label={`Delete ${backup.kind} ${backup.type} backup`}
                            disabled={busy}
                            onClick={() =>
                              confirmDeleteBackup(
                                backup.id,
                                `${backup.kind} · ${backup.type}`,
                              )
                            }
                          >
                            <Trash size={16} />
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                    </div>
                  ))}
                </div>
              )}
            </Stack>
          </AppSurfaceCard>
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}

interface DetailItemProps {
  label: string;
  value: string;
  icon: React.ReactNode;
}

function ClearAction(props: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}): JSX.Element {
  return (
    <Tooltip label={props.label}>
      <span>
        <ActionIcon
          variant="light"
          color="red"
          aria-label={props.label}
          onClick={props.onClick}
          disabled={props.disabled === true}
        >
          <Broom size={16} />
        </ActionIcon>
      </span>
    </Tooltip>
  );
}

function TabIntro(props: {
  title: string;
  purpose: string;
  useWhen: string;
  action?: React.ReactNode;
}): JSX.Element {
  return (
    <div className={classes.tabIntro}>
      <Group justify="space-between" align="flex-start" gap="sm" wrap="wrap">
        <Title order={4} className={classes.panelTitle}>
          {props.title}
        </Title>
        {props.action}
      </Group>
      <Text size="sm">{props.purpose}</Text>
      <Text size="xs" c="dimmed">
        Use when: {props.useWhen}
      </Text>
    </div>
  );
}

function DetailItem({ label, value, icon }: DetailItemProps): JSX.Element {
  return (
    <div className={classes.detailItem}>
      <Text className={classes.detailLabel}>
        {icon}
        {label}
      </Text>
      <Text size="xs" className={classes.detailValue}>
        {value}
      </Text>
    </div>
  );
}

interface LogEmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

function LogEmptyState({
  icon,
  title,
  description,
}: LogEmptyStateProps): JSX.Element {
  return (
    <EmptyState layout="stacked" icon={icon} title={title} description={description} />
  );
}
