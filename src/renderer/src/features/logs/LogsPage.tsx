import {
  ArrowSquareOut,
  ClockCounterClockwise,
  DownloadSimple,
  FileText,
  HardDrives,
} from "@phosphor-icons/react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Select,
  Stack,
  Tabs,
  Text,
  Title,
} from "@mantine/core";
import { PageScaffold } from "@layout/PageScaffold/PageScaffold";
import type { ServerOperationalLogs, ServerProfile, ServerUpdateLogFile } from "@shared/types";
import { useEffect, useMemo, useState } from "react";
import classes from "./LogsPage.module.css";

type LogsSection = "events" | "runtime" | "updates" | "backups";

interface Props {
  servers: ServerProfile[];
  selectedServerId: string | null;
  onSelectedServerChange: (serverId: string) => void;
  initialSection?: LogsSection;
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

export function LogsPage(props: Props): JSX.Element {
  const [activeSection, setActiveSection] = useState<LogsSection>(props.initialSection ?? "events");
  const [logs, setLogs] = useState<ServerOperationalLogs | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [selectedUpdateFile, setSelectedUpdateFile] = useState<string | null>(null);
  const [updateContent, setUpdateContent] = useState("");

  const selectedServer = useMemo(
    () => props.servers.find((server) => server.id === props.selectedServerId) ?? props.servers[0] ?? null,
    [props.selectedServerId, props.servers],
  );

  useEffect(() => {
    if (props.initialSection !== undefined) {
      setActiveSection(props.initialSection);
    }
  }, [props.initialSection]);

  const openUpdateLog = async (serverId: string, fileName: string) => {
    setBusy(true);
    setError(null);
    const result = await window.api.readServerUpdateLog(serverId, fileName, 300_000);
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
    setSelectedUpdateFile(null);
    setUpdateContent("");
    const result = await window.api.listServerLogs(serverId);
    setLoading(false);
    if (!result.ok) {
      setLogs(null);
      setError(result.error ?? "Could not load logs");
      return;
    }
    setLogs(result.data);
    const first = result.data.updateFiles[0]?.fileName ?? null;
    if (first !== null) {
      void openUpdateLog(serverId, first);
    }
  };

  useEffect(() => {
    if (selectedServer !== null) {
      void load(selectedServer.id);
    } else {
      setLogs(null);
    }
  }, [selectedServer?.id]);

  const exportLogs = async () => {
    if (selectedServer === null) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    const result = await window.api.exportServerLogs(selectedServer.id);
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
    if (selectedServer === null || selectedUpdateFile === null) return;
    setBusy(true);
    setError(null);
    const result = await window.api.openServerUpdateLogFile(selectedServer.id, selectedUpdateFile);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Could not open the log externally");
    }
  };

  const selectedUpdateInfo = logs?.updateFiles.find((file) => file.fileName === selectedUpdateFile) ?? null;

  return (
    <PageScaffold
      title="Logs"
      subtitle="Events, runtime, updates, and backups per server"
      fillViewport
      actions={
        <Group gap="sm" wrap="wrap">
          <Select
            aria-label="Select server"
            value={selectedServer?.id ?? null}
            data={props.servers.map((server) => ({ value: server.id, label: server.name }))}
            placeholder="Select a server"
            onChange={(value) => {
              if (value !== null) {
                props.onSelectedServerChange(value);
              }
            }}
            className={classes.serverSelect}
          />
          <Button variant="default" leftSection={<ClockCounterClockwise size={16} />} onClick={() => selectedServer && void load(selectedServer.id)} disabled={selectedServer === null || loading || busy}>
            Reload
          </Button>
          <Button leftSection={<DownloadSimple size={16} />} onClick={() => void exportLogs()} disabled={selectedServer === null || loading || busy}>
            Export
          </Button>
        </Group>
      }
    >
      <Stack gap="lg" className={classes.logsContent} data-logs-page>
        {info !== null && <Alert color="blue">{info}</Alert>}
        {error !== null && <Alert color="red">{error}</Alert>}

        {selectedServer === null ? (
          <Card withBorder className={classes.panel}>
            <Text c="dimmed">No servers configured yet.</Text>
          </Card>
        ) : (
          <Tabs
            value={activeSection}
            onChange={(value) => setActiveSection((value as LogsSection) ?? "events")}
            className={classes.tabs}
          >
            <Tabs.List className={classes.tabList}>
              <Tabs.Tab value="events">Events</Tabs.Tab>
              <Tabs.Tab value="runtime">Runtime</Tabs.Tab>
              <Tabs.Tab value="updates">Updates</Tabs.Tab>
              <Tabs.Tab value="backups">Backups</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="events" className={classes.tabPanel}>
              <Card withBorder className={`${classes.panel} ${classes.fillPanel}`}>
                <Stack gap="sm" className={classes.panelStack}>
                  <Title order={3}>Events</Title>
                  {loading ? (
                    <Text c="dimmed">Loading events...</Text>
                  ) : logs === null || logs.events.length === 0 ? (
                    <LogEmptyState
                      icon={<ClockCounterClockwise size={24} />}
                      title="No recent events"
                      description="Server operations will appear here when they are logged."
                    />
                  ) : (
                    <div
                      className={classes.eventList}
                      data-logs-scroll-region="events"
                    >
                      {logs.events.map((event) => (
                        <div key={event.id} className={classes.eventRow}>
                          <Text size="sm" c="dimmed">{new Date(event.createdAt).toLocaleString()}</Text>
                          <Text size="sm">{event.message}</Text>
                        </div>
                      ))}
                    </div>
                  )}
                </Stack>
              </Card>
            </Tabs.Panel>

            <Tabs.Panel value="runtime" className={classes.tabPanel}>
              <Card withBorder className={`${classes.panel} ${classes.fillPanel}`}>
                <Stack gap="sm" className={classes.panelStack}>
                  <Title order={3}>Runtime</Title>
                  {loading ? (
                    <Text c="dimmed">Loading runtime log...</Text>
                  ) : logs === null || logs.runtimeLogLines.length === 0 ? (
                    <LogEmptyState
                      icon={<FileText size={24} />}
                      title="No runtime output"
                      description="Captured console output will appear here when the server produces activity."
                    />
                  ) : (
                    <pre
                      className={classes.console}
                      data-logs-scroll-region="runtime"
                    >
                      {logs.runtimeLogLines.join("\n")}
                    </pre>
                  )}
                </Stack>
              </Card>
            </Tabs.Panel>

            <Tabs.Panel value="updates" className={classes.tabPanel}>
              <div className={classes.updatesLayout}>
                <Card withBorder className={`${classes.panel} ${classes.historyPanel} ${classes.fillPanel}`}>
                  <Stack gap="sm" className={classes.panelStack}>
                    <Title order={3} size="h4" className={classes.panelTitle}>Update history</Title>
                    {loading ? (
                      <Text c="dimmed">Loading history...</Text>
                    ) : logs === null || logs.updateFiles.length === 0 ? (
                      <Text c="dimmed">No update logs.</Text>
                    ) : (
                      <div
                        className={classes.updateList}
                        data-logs-scroll-region="updates-list"
                      >
                        {logs.updateFiles.map((file) => (
                          <button
                            key={file.fileName}
                            type="button"
                            className={`${classes.updateRow} ${selectedUpdateFile === file.fileName ? classes.updateRowActive : ""}`}
                            onClick={() => void openUpdateLog(selectedServer.id, file.fileName)}
                          >
                            <div className={classes.updateSummary}>
                              <Text size="sm" fw={600} truncate="end" title={file.fileName}>{file.fileName}</Text>
                              <Text size="sm" c="dimmed">{new Date(file.modifiedAt).toLocaleString()}</Text>
                            </div>
                            <Badge color={statusColor(file.status)} variant="light">{file.status}</Badge>
                          </button>
                        ))}
                      </div>
                    )}
                  </Stack>
                </Card>

                <Card withBorder className={`${classes.panel} ${classes.detailPanel} ${classes.fillPanel}`}>
                  <Stack gap="sm" className={classes.panelStack}>
                    <Group justify="space-between" align="center" wrap="wrap" gap="sm" className={classes.detailHeader}>
                      <Group gap="sm" wrap="nowrap">
                        <Title order={3} size="h4" className={classes.panelTitle}>Update details</Title>
                        {selectedUpdateInfo !== null && (
                          <Badge color={statusColor(selectedUpdateInfo.status)} variant="light">{selectedUpdateInfo.status}</Badge>
                        )}
                      </Group>
                      {selectedUpdateInfo !== null && (
                        <Button
                          variant="default"
                          size="compact-sm"
                          leftSection={<ArrowSquareOut size={15} />}
                          onClick={() => void openInExternalViewer()}
                          disabled={busy}
                        >
                          Open in external viewer
                        </Button>
                      )}
                    </Group>

                    {selectedUpdateInfo === null ? (
                      <Text c="dimmed">Select an update to see details.</Text>
                    ) : (
                      <>
                        <div className={classes.detailsMeta}>
                          <DetailItem label="Date" value={new Date(selectedUpdateInfo.modifiedAt).toLocaleString()} icon={<ClockCounterClockwise size={16} />} />
                          <DetailItem label="Duration" value={formatDuration(selectedUpdateInfo.durationMs)} icon={<ClockCounterClockwise size={16} />} />
                          <DetailItem label="Size" value={formatSize(selectedUpdateInfo.sizeBytes)} icon={<FileText size={16} />} />
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
                </Card>
              </div>
            </Tabs.Panel>

            <Tabs.Panel value="backups" className={classes.tabPanel}>
              <Card withBorder className={`${classes.panel} ${classes.fillPanel}`}>
                <Stack gap="sm" className={classes.panelStack}>
                  <Title order={3}>Backups</Title>
                  {loading ? (
                    <Text c="dimmed">Loading backups...</Text>
                  ) : logs === null || logs.backups.length === 0 ? (
                    <LogEmptyState
                      icon={<HardDrives size={24} />}
                      title="No backups recorded"
                      description="Completed backups and their paths will appear in this history."
                    />
                  ) : (
                    <div
                      className={classes.eventList}
                      data-logs-scroll-region="backups"
                    >
                      {logs.backups.map((backup) => (
                        <div key={backup.id} className={classes.eventRow}>
                          <Text fw={600}>{backup.type}</Text>
                          <Text size="sm" c="dimmed">{new Date(backup.createdAt).toLocaleString()} | {backup.status}</Text>
                          <Text size="sm">{backup.path}</Text>
                        </div>
                      ))}
                    </div>
                  )}
                </Stack>
              </Card>
            </Tabs.Panel>
          </Tabs>
        )}
      </Stack>
    </PageScaffold>
  );
}

interface DetailItemProps {
  label: string;
  value: string;
  icon: React.ReactNode;
}

function DetailItem({ label, value, icon }: DetailItemProps): JSX.Element {
  return (
    <div className={classes.detailItem}>
      <Text className={classes.detailLabel}>{icon}{label}</Text>
      <Text size="xs" className={classes.detailValue}>{value}</Text>
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
    <div className={classes.emptyState}>
      <div className={classes.emptyIcon}>{icon}</div>
      <Text fw={600}>{title}</Text>
      <Text c="dimmed" size="sm" maw={420}>
        {description}
      </Text>
    </div>
  );
}
