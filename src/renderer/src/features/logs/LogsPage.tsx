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
      setInfo(`Registros exportados en: ${result.data}`);
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
      title="Registros"
      subtitle="Eventos, ejecución, actualizaciones y respaldos por servidor"
      fillViewport
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
      <Stack gap="lg" className={classes.logsContent} data-logs-page>
        {info !== null && <Alert color="blue">{info}</Alert>}
        {error !== null && <Alert color="red">{error}</Alert>}

        {selectedServer === null ? (
          <Card withBorder className={classes.panel}>
            <Text c="dimmed">No hay servidores configurados todavía.</Text>
          </Card>
        ) : (
          <Tabs
            value={activeSection}
            onChange={(value) => setActiveSection((value as LogsSection) ?? "events")}
            className={classes.tabs}
          >
            <Tabs.List className={classes.tabList}>
              <Tabs.Tab value="events">Eventos</Tabs.Tab>
              <Tabs.Tab value="runtime">Ejecución</Tabs.Tab>
              <Tabs.Tab value="updates">Actualizaciones</Tabs.Tab>
              <Tabs.Tab value="backups">Respaldos</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="events" className={classes.tabPanel}>
              <Card withBorder className={`${classes.panel} ${classes.fillPanel}`}>
                <Stack gap="sm" className={classes.panelStack}>
                  <Title order={3}>Eventos</Title>
                  {loading ? (
                    <Text c="dimmed">Cargando eventos...</Text>
                  ) : logs === null || logs.events.length === 0 ? (
                    <LogEmptyState
                      icon={<ClockCounterClockwise size={24} />}
                      title="Sin eventos recientes"
                      description="Las operaciones del servidor aparecerán aquí cuando se registren."
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
                  <Title order={3}>Ejecución</Title>
                  {loading ? (
                    <Text c="dimmed">Cargando registro de ejecución...</Text>
                  ) : logs === null || logs.runtimeLogLines.length === 0 ? (
                    <LogEmptyState
                      icon={<FileText size={24} />}
                      title="Sin salida de ejecución"
                      description="La consola capturada aparecerá aquí cuando el servidor genere actividad."
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
                    <Title order={3} size="h4" className={classes.panelTitle}>Historial de actualizaciones</Title>
                    {loading ? (
                      <Text c="dimmed">Cargando historial...</Text>
                    ) : logs === null || logs.updateFiles.length === 0 ? (
                      <Text c="dimmed">Sin registros de actualización.</Text>
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
                        <Title order={3} size="h4" className={classes.panelTitle}>Detalle de la actualización</Title>
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
                          Abrir en visor externo
                        </Button>
                      )}
                    </Group>

                    {selectedUpdateInfo === null ? (
                      <Text c="dimmed">Selecciona un update para ver el detalle.</Text>
                    ) : (
                      <>
                        <div className={classes.detailsMeta}>
                          <DetailItem label="Fecha" value={new Date(selectedUpdateInfo.modifiedAt).toLocaleString()} icon={<ClockCounterClockwise size={16} />} />
                          <DetailItem label="Duración" value={formatDuration(selectedUpdateInfo.durationMs)} icon={<ClockCounterClockwise size={16} />} />
                          <DetailItem label="Tamaño" value={formatSize(selectedUpdateInfo.sizeBytes)} icon={<FileText size={16} />} />
                        </div>
                        <pre
                          className={classes.console}
                          data-logs-scroll-region="update-content"
                        >
                          {updateContent.length > 0 ? updateContent : "Cargando contenido del log..."}
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
                  <Title order={3}>Respaldos</Title>
                  {loading ? (
                    <Text c="dimmed">Cargando backups...</Text>
                  ) : logs === null || logs.backups.length === 0 ? (
                    <LogEmptyState
                      icon={<HardDrives size={24} />}
                      title="Sin respaldos registrados"
                      description="Los respaldos completados y sus rutas aparecerán en este historial."
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
