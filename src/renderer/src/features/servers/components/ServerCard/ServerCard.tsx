import {
  ArrowsClockwise,
  CloudArrowDown,
  Copy,
  DotsThreeVertical,
  FileText,
  FolderOpen,
  Gear,
  HardDrives,
  Pause,
  PencilSimple,
  Play,
  Terminal,
  Trash,
  Warning,
  XCircle,
} from "@phosphor-icons/react";
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Menu,
  Progress,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import type { ServerInstallationInfo, ServerProfile, ServerRuntimeInfo } from "@shared/types";
import { formatSteamCmdByteProgress } from "@shared/steamcmd-progress";
import { useState } from "react";
import classes from "./ServerCard.module.css";

interface Props {
  server: ServerProfile;
  runtime: ServerRuntimeInfo | null;
  installation: ServerInstallationInfo | null;
  steamCmdBusy?: boolean;
  steamCmdProgressPercent?: number | null;
  steamCmdProgressLabel?: string | null;
  steamCmdProgressBytesDownloaded?: number | null;
  steamCmdProgressBytesTotal?: number | null;
  steamCmdOperation?: "install-steamcmd" | "install-files" | "update" | "sync-files" | null;
  onStart: () => void;
  onStop: () => void;
  onKill: () => void;
  onRestart: () => void;
  onEdit: () => void;
  onOpenIni: () => void;
  onOpenLogs: () => void;
  onOpenFolder: () => void;
  onInstallFiles: () => void;
  onUpdateNow: () => void;
  onClone: () => void;
  onDelete: () => void;
  onRcon: (command: string) => void;
  onCancelSteamCmd: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  stopped: "Apagado",
  starting: "Iniciando",
  running: "Activo",
  stopping: "Deteniendo",
  error: "Error",
};

const QUICK_COMMANDS = [
  { label: "SaveWorld", command: "SaveWorld" },
  { label: "ListPlayers", command: "ListPlayers" },
  { label: "Broadcast aviso", command: "Broadcast Aviso del administrador" },
];

export function ServerCard(props: Props): JSX.Element {
  const {
    server,
    runtime,
    installation,
    steamCmdBusy = false,
    steamCmdProgressPercent = null,
    steamCmdProgressLabel = null,
    steamCmdProgressBytesDownloaded = null,
    steamCmdProgressBytesTotal = null,
    steamCmdOperation = null,
  } = props;
  const status = runtime?.status ?? "stopped";
  const isActive = status === "starting" || status === "running" || status === "stopping";
  const isInstallationReady = installation?.installed === true;
  const officialVersion = installation?.officialVersion ?? null;
  const localVersion = installation?.arkVersion ?? installation?.build ?? null;
  const updateAvailable =
    isInstallationReady && officialVersion !== null && localVersion !== null && officialVersion !== localVersion;
  const [customCommand, setCustomCommand] = useState("");

  const installStateLabel = steamCmdBusy
    ? steamCmdOperation === "update" || steamCmdOperation === "sync-files"
      ? "Actualizando…"
      : "Instalando…"
    : !isInstallationReady
      ? "Sin instalar"
      : updateAvailable
        ? "Update available"
        : "Up to date";

  const byteProgressLabel =
    steamCmdProgressBytesDownloaded !== null && steamCmdProgressBytesTotal !== null
      ? formatSteamCmdByteProgress(
          steamCmdProgressBytesDownloaded,
          steamCmdProgressBytesTotal,
        )
      : null;
  const shortProgressLabel =
    byteProgressLabel !== null
      ? (steamCmdProgressLabel?.split(" · ")[0]?.trim() || "SteamCMD en curso…")
      : (steamCmdProgressLabel ?? "SteamCMD en curso…");

  return (
    <Card withBorder className={classes.card}>
      <Stack gap="md">
        <Group justify="space-between" align="flex-start">
          <Group gap="sm" align="flex-start">
            <div className={classes.thumb}>
              <HardDrives size={28} weight="duotone" />
            </div>
            <div>
              <Title order={3}>{server.name}</Title>
              <Text c="dimmed" size="sm">{server.sessionName}</Text>
            </div>
          </Group>
          <Badge
            color={
              steamCmdBusy
                ? "blue"
                : status === "running"
                  ? "green"
                  : status === "error"
                    ? "red"
                    : status === "starting" || status === "stopping"
                      ? "blue"
                      : "gray"
            }
            variant="light"
          >
            {steamCmdBusy ? installStateLabel : (STATUS_LABEL[status] ?? status)}
          </Badge>
        </Group>

        <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="sm">
          <MetaItem label="Jugadores" value="—" />
          <MetaItem label="Mapa" value={server.map} />
          <MetaItem label="Cluster" value={server.clusterId ?? "—"} />
          <MetaItem label="Mods" value={String(server.mods.length)} />
          <MetaItem label="Versión" value={localVersion ?? "—"} />
          <MetaItem
            label="Estado"
            value={installStateLabel}
            tone={
              steamCmdBusy
                ? "warn"
                : !isInstallationReady
                  ? "muted"
                  : updateAvailable
                    ? "warn"
                    : "ok"
            }
          />
        </SimpleGrid>

        {steamCmdBusy && (
          <Stack gap={6} className={classes.progressBlock}>
            <Group justify="space-between" gap="xs" align="flex-start">
              <div>
                <Text size="sm">{shortProgressLabel}</Text>
                {byteProgressLabel !== null && (
                  <Text size="xs" c="dimmed" mt={2}>
                    Descargado: {byteProgressLabel}
                  </Text>
                )}
              </div>
              {steamCmdProgressPercent !== null && (
                <Text size="sm" c="dimmed">
                  {steamCmdProgressPercent.toFixed(0)}%
                </Text>
              )}
            </Group>
            <Progress
              value={steamCmdProgressPercent ?? 12}
              animated
              striped
              size="sm"
              radius="xl"
            />
          </Stack>
        )}

        {runtime?.lastError !== null && runtime?.lastError !== undefined && (
          <Text c="red" size="sm">{runtime.lastError}</Text>
        )}

        <Group gap="xs" wrap="wrap">
          {steamCmdBusy ? (
            <Button color="red" variant="light" leftSection={<XCircle size={16} />} onClick={props.onCancelSteamCmd}>
              Cancelar operación
            </Button>
          ) : (
            <>
              <Button leftSection={<Play size={16} />} onClick={props.onStart} disabled={isActive || !isInstallationReady}>
                Iniciar
              </Button>
              <Button variant="light" leftSection={<Pause size={16} />} onClick={props.onStop} disabled={!isActive}>
                Detener
              </Button>
              <ActionIcon variant="subtle" size="lg" onClick={props.onRestart} disabled={!isInstallationReady} aria-label="Reiniciar">
                <ArrowsClockwise size={18} />
              </ActionIcon>
              <ActionIcon variant="subtle" size="lg" onClick={props.onOpenFolder} aria-label="Abrir carpeta">
                <FolderOpen size={18} />
              </ActionIcon>
              <Menu shadow="md" withinPortal>
                <Menu.Target>
                  <ActionIcon variant="subtle" size="lg" aria-label="Más opciones">
                    <DotsThreeVertical size={18} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item leftSection={<PencilSimple size={16} />} onClick={props.onEdit}>Editar servidor</Menu.Item>
                  <Menu.Item leftSection={<Gear size={16} />} onClick={props.onOpenIni} disabled={!isInstallationReady}>Editar INI</Menu.Item>
                  <Menu.Item leftSection={<FileText size={16} />} onClick={props.onOpenLogs} disabled={!isInstallationReady}>Ver logs</Menu.Item>
                  {isInstallationReady ? (
                    <Menu.Item leftSection={<Warning size={16} />} onClick={props.onUpdateNow}>Actualizar servidor</Menu.Item>
                  ) : (
                    <Menu.Item leftSection={<CloudArrowDown size={16} />} onClick={props.onInstallFiles}>Instalar archivos</Menu.Item>
                  )}
                  <Menu.Item leftSection={<Copy size={16} />} onClick={props.onClone}>Clonar</Menu.Item>
                  {isActive && <Menu.Item color="red" leftSection={<XCircle size={16} />} onClick={props.onKill}>Forzar cierre</Menu.Item>}
                  <Menu.Item color="red" leftSection={<Trash size={16} />} onClick={props.onDelete}>Eliminar</Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </>
          )}
        </Group>

        {status === "running" && !steamCmdBusy && (
          <Stack gap="sm" className={classes.rcon}>
            <Group gap="xs" wrap="wrap">
              {QUICK_COMMANDS.map((command) => (
                <Button
                  key={command.command}
                  variant="light"
                  size="xs"
                  leftSection={<Terminal size={14} />}
                  onClick={() => props.onRcon(command.command)}
                >
                  {command.label}
                </Button>
              ))}
            </Group>
            <Group align="flex-end" wrap="nowrap">
              <TextInput
                className={classes.rconInput}
                value={customCommand}
                placeholder="Comando RCON personalizado..."
                onChange={(event) => setCustomCommand(event.currentTarget.value)}
              />
              <Button
                leftSection={<Terminal size={16} />}
                onClick={() => {
                  if (customCommand.trim().length > 0) {
                    props.onRcon(customCommand.trim());
                    setCustomCommand("");
                  }
                }}
              >
                Enviar
              </Button>
            </Group>
          </Stack>
        )}
      </Stack>
    </Card>
  );
}

interface MetaItemProps {
  label: string;
  value: string;
  tone?: "default" | "muted" | "ok" | "warn";
}

function MetaItem({ label, value, tone = "default" }: MetaItemProps): JSX.Element {
  return (
    <div className={classes.metaItem}>
      <Text className={classes.metaLabel}>{label}</Text>
      <Text className={classes[`metaValue-${tone}`]}>{value}</Text>
    </div>
  );
}