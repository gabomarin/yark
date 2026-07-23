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
      setError(result.error ?? "No se pudo abrir log de update");
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
      setError(result.error ?? "No se pudieron cargar logs");
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
      setError(result.error ?? "No se pudieron exportar logs");
      return;
    }
    if (result.data !== null) {
      setInfo(`Logs exportados en: ${result.data}`);
    }
  };

  const openInExternalViewer = async () => {
    if (selectedServer === null || selectedUpdateFile === null) return;
    setBusy(true);
    setError(null);
    const result = await window.api.openServerUpdateLogFile(selectedServer.id, selectedUpdateFile);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "No se pudo abrir el log externamente");
    }
  };

  const selectedUpdateInfo = logs?.updateFiles.find((file) => file.fileName === selectedUpdateFile) ?? null;

  return (
    <PageScaffold
      title="Logs"
      subtitle="Eventos, runtime, updates y backups por servidor"
      actions={
        <Group gap="sm" wrap="wrap">
          <Select
            aria-label="Seleccionar servidor"
            value={selectedServer?.id ?? null}
            data={props.servers.map((server) => ({ value: server.id, label: server.name }))}
            placeholder="Selecciona un servidor"
            onChange={(value) => {
              if (value !== null) {
                props.onSelectedServerChange(value);
              }
            }}
            className={classes.serverSelect}
          />
          <Button variant="default" leftSection={<ClockCounterClockwise size={16} />} onClick={() => selectedServer && void load(selectedServer.id)} disabled={selectedServer === null || loading || busy}>
            Recargar
          </Button>
          <Button leftSection={<DownloadSimple size={16} />} onClick={() => void exportLogs()} disabled={selectedServer === null || loading || busy}>
            Exportar
          </Button>
        </Group>
      }
    >
      <Stack gap="lg">
        {info !== null && <Alert color="blue">{info}</Alert>}
        {error !== null && <Alert color="red">{error}</Alert>}

        {selectedServer === null ? (
          <Card withBorder className={classes.panel}>
            <Text c="dimmed">No hay servidores configurados todavía.</Text>
          </Card>
        ) : (
          <Tabs value={activeSection} onChange={(value) => setActiveSection((value as LogsSection) ?? "events")}>
            <Tabs.List>
              <Tabs.Tab value="events">Events</Tabs.Tab>
              <Tabs.Tab value="runtime">Runtime</Tabs.Tab>
              <Tabs.Tab value="updates">Update Logs</Tabs.Tab>
              <Tabs.Tab value="backups">Backups</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="events" pt="md">
              <Card withBorder className={classes.panel}>
                <Stack gap="sm">
                  <Title order={3}>Eventos</Title>
                  {loading ? (
                    <Text c="dimmed">Cargando eventos...</Text>
                  ) : logs === null || logs.events.length === 0 ? (
                    <Text c="dimmed">Sin eventos recientes.</Text>
                  ) : (
                    <div className={classes.eventList}>
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

            <Tabs.Panel value="runtime" pt="md">
              <Card withBorder className={classes.panel}>
                <Stack gap="sm">
                  <Title order={3}>Runtime</Title>
                  {loading ? (
                    <Text c="dimmed">Cargando runtime...</Text>
                  ) : logs === null || logs.runtimeLogLines.length === 0 ? (
                    <Text c="dimmed">Sin salida runtime capturada todavía.</Text>
                  ) : (
                    <pre className={classes.console}>{logs.runtimeLogLines.join("\n")}</pre>
                  )}
                </Stack>
              </Card>
            </Tabs.Panel>

            <Tabs.Panel value="updates" pt="md">
              <div className={classes.updatesLayout}>
                <Card withBorder className={classes.panel}>
                  <Stack gap="sm">
                    <Title order={3}>Update History</Title>
                    {loading ? (
                      <Text c="dimmed">Cargando historial...</Text>
                    ) : logs === null || logs.updateFiles.length === 0 ? (
                      <Text c="dimmed">Sin logs de update.</Text>
                    ) : (
                      <div className={classes.updateList}>
                        {logs.updateFiles.map((file) => (
                          <button
                            key={file.fileName}
                            type="button"
                            className={`${classes.updateRow} ${selectedUpdateFile === file.fileName ? classes.updateRowActive : ""}`}
                            onClick={() => void openUpdateLog(selectedServer.id, file.fileName)}
                          >
                            <div>
                              <Text fw={600}>{selectedServer.name}</Text>
                              <Text size="sm" c="dimmed">{new Date(file.modifiedAt).toLocaleString()}</Text>
                            </div>
                            <Badge color={statusColor(file.status)} variant="light">{file.status}</Badge>
                          </button>
                        ))}
                      </div>
                    )}
                  </Stack>
                </Card>

                <Card withBorder className={classes.panel}>
                  <Stack gap="md">
                    <Group justify="space-between" align="center">
                      <Title order={3}>Update Details</Title>
                      {selectedUpdateInfo !== null && (
                        <Badge color={statusColor(selectedUpdateInfo.status)} variant="light">{selectedUpdateInfo.status}</Badge>
                      )}
                    </Group>

                    {selectedUpdateInfo === null ? (
                      <Text c="dimmed">Selecciona un update para ver el detalle.</Text>
                    ) : (
                      <>
                        <div className={classes.detailsGrid}>
                          <DetailItem label="Servidor" value={selectedServer.name} icon={<HardDrives size={16} />} />
                          <DetailItem label="Fecha" value={new Date(selectedUpdateInfo.modifiedAt).toLocaleString()} icon={<ClockCounterClockwise size={16} />} />
                          <DetailItem label="Duración" value={formatDuration(selectedUpdateInfo.durationMs)} icon={<ClockCounterClockwise size={16} />} />
                          <DetailItem label="Tamaño" value={formatSize(selectedUpdateInfo.sizeBytes)} icon={<FileText size={16} />} />
                        </div>
                        <Group justify="flex-end">
                          <Button variant="light" leftSection={<ArrowSquareOut size={16} />} onClick={() => void openInExternalViewer()} disabled={busy}>
                            Open in external viewer
                          </Button>
                        </Group>
                        <pre className={classes.console}>{updateContent.length > 0 ? updateContent : "Cargando contenido del log..."}</pre>
                      </>
                    )}
                  </Stack>
                </Card>
              </div>
            </Tabs.Panel>

            <Tabs.Panel value="backups" pt="md">
              <Card withBorder className={classes.panel}>
                <Stack gap="sm">
                  <Title order={3}>Backups</Title>
                  {loading ? (
                    <Text c="dimmed">Cargando backups...</Text>
                  ) : logs === null || logs.backups.length === 0 ? (
                    <Text c="dimmed">Sin historial de backups.</Text>
                  ) : (
                    <div className={classes.eventList}>
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
      <Text>{value}</Text>
    </div>
  );
}