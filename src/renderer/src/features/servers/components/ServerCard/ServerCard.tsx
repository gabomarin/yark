import {
  ArrowsClockwise,
  CloudArrowDown,
  Copy,
  FileText,
  FolderOpen,
  HardDrives,
  MagnifyingGlass,
  Pause,
  Play,
  ShieldCheck,
  Terminal,
  Trash,
  XCircle,
} from "@phosphor-icons/react";
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Progress,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import type { ServerInstallationInfo, ServerProfile, ServerRuntimeInfo } from "@shared/types";
import { formatSteamCmdByteProgress, steamCmdByteProgressNoun } from "@shared/steamcmd-progress";
import { useState, type KeyboardEvent, type MouseEvent } from "react";
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
  steamCmdOperation?: "install-steamcmd" | "install-files" | "update" | "sync-files" | "verify-files" | null;
  checkingUpdates?: boolean;
  onStart: () => void;
  onStop: () => void;
  onKill: () => void;
  onRestart: () => void;
  onOpenWorkspace: () => void;
  onOpenLogs: () => void;
  onOpenFolder: () => void;
  onInstallFiles: () => void;
  onUpdateNow: () => void;
  onVerifyFiles: () => void;
  onCheckUpdates: () => void;
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

function IconAction(props: {
  label: string;
  disabled?: boolean;
  color?: string;
  loading?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <Tooltip label={props.label} withArrow>
      <ActionIcon
        variant={props.color ? "light" : "subtle"}
        size="lg"
        color={props.color}
        disabled={props.disabled}
        loading={props.loading}
        onClick={props.onClick}
        aria-label={props.label}
      >
        {props.children}
      </ActionIcon>
    </Tooltip>
  );
}

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
    checkingUpdates = false,
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
    ? steamCmdOperation === "verify-files"
      ? "Verificando…"
      : steamCmdOperation === "update" || steamCmdOperation === "sync-files"
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
  const byteProgressNoun = steamCmdByteProgressNoun(steamCmdOperation);
  const shortProgressLabel =
    byteProgressLabel !== null
      ? (steamCmdProgressLabel?.split(" · ")[0]?.trim()
        || (steamCmdOperation === "verify-files" ? "Verificando" : "SteamCMD en curso…"))
      : (steamCmdProgressLabel
        ?? (steamCmdOperation === "verify-files" ? "Verificando" : "SteamCMD en curso…"));

  const openWorkspace = () => {
    if (!steamCmdBusy) {
      props.onOpenWorkspace();
    }
  };

  const onCardKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openWorkspace();
    }
  };

  const stopCardNavigation = (event: MouseEvent) => {
    event.stopPropagation();
  };

  return (
    <Card withBorder className={classes.card}>
      <Stack gap="md">
        <UnstyledButton
          className={classes.cardHit}
          onClick={openWorkspace}
          onKeyDown={onCardKeyDown}
          aria-label={`Abrir configuración de ${server.name}`}
        >
          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <Group gap="sm" align="flex-start" wrap="nowrap">
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

          <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="sm" mt="md">
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
        </UnstyledButton>

        {steamCmdBusy && (
          <Stack gap={6} className={classes.progressBlock}>
            <Group justify="space-between" gap="xs" align="flex-start">
              <div>
                <Text size="sm">{shortProgressLabel}</Text>
                {byteProgressLabel !== null && (
                  <Text size="xs" c="dimmed" mt={2}>
                    {byteProgressNoun}: {byteProgressLabel}
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

        <Group gap={4} wrap="wrap" onClick={stopCardNavigation} onKeyDown={stopCardNavigation}>
          {steamCmdBusy ? (
            <IconAction label="Cancelar operación" color="red" onClick={props.onCancelSteamCmd}>
              <XCircle size={18} />
            </IconAction>
          ) : (
            <>
              <IconAction
                label="Iniciar"
                color="teal"
                onClick={props.onStart}
                disabled={isActive || !isInstallationReady}
              >
                <Play size={18} />
              </IconAction>
              <IconAction
                label="Detener"
                color="yellow"
                onClick={props.onStop}
                disabled={!isActive}
              >
                <Pause size={18} />
              </IconAction>
              <IconAction
                label="Reiniciar"
                color="cyan"
                onClick={props.onRestart}
                disabled={!isInstallationReady || !isActive}
              >
                <ArrowsClockwise size={18} />
              </IconAction>
              <IconAction label="Abrir carpeta" color="gray" onClick={props.onOpenFolder}>
                <FolderOpen size={18} />
              </IconAction>
              <IconAction
                label="Ver logs"
                color="blue"
                onClick={props.onOpenLogs}
                disabled={!isInstallationReady}
              >
                <FileText size={18} />
              </IconAction>
              {isInstallationReady ? (
                <>
                  <IconAction
                    label="Verificar actualizaciones"
                    color="indigo"
                    loading={checkingUpdates}
                    onClick={props.onCheckUpdates}
                    disabled={checkingUpdates}
                  >
                    <MagnifyingGlass size={18} />
                  </IconAction>
                  <IconAction
                    label={
                      isActive
                        ? "Detén el servidor antes de actualizar"
                        : updateAvailable
                          ? "Actualizar servidor (hay versión nueva)"
                          : "Actualizar servidor"
                    }
                    color={updateAvailable ? "orange" : "grape"}
                    onClick={props.onUpdateNow}
                    disabled={isActive}
                  >
                    <CloudArrowDown size={18} />
                  </IconAction>
                  <IconAction
                    label={
                      isActive
                        ? "Detén el servidor antes de verificar"
                        : "Verificar integridad"
                    }
                    color="violet"
                    onClick={props.onVerifyFiles}
                    disabled={isActive}
                  >
                    <ShieldCheck size={18} />
                  </IconAction>
                </>
              ) : (
                <IconAction label="Instalar archivos" color="blue" onClick={props.onInstallFiles}>
                  <CloudArrowDown size={18} />
                </IconAction>
              )}
              <IconAction label="Clonar" color="gray" onClick={props.onClone}>
                <Copy size={18} />
              </IconAction>
              {isActive && (
                <IconAction label="Forzar cierre" color="red" onClick={props.onKill}>
                  <XCircle size={18} />
                </IconAction>
              )}
              <IconAction
                label={
                  isActive
                    ? "Detén el servidor antes de eliminarlo"
                    : "Eliminar servidor"
                }
                color="red"
                onClick={props.onDelete}
                disabled={isActive}
              >
                <Trash size={18} />
              </IconAction>
            </>
          )}
        </Group>

        {status === "running" && !steamCmdBusy && (
          <Stack gap="sm" className={classes.rcon} onClick={stopCardNavigation}>
            <Group gap="xs" wrap="wrap">
              {QUICK_COMMANDS.map((command) => (
                <Tooltip key={command.command} label={`RCON: ${command.command}`} withArrow>
                  <Button
                    variant="light"
                    size="compact-sm"
                    leftSection={<Terminal size={14} />}
                    onClick={() => props.onRcon(command.command)}
                  >
                    {command.label}
                  </Button>
                </Tooltip>
              ))}
            </Group>
            <Group align="flex-end" wrap="nowrap">
              <TextInput
                className={classes.rconInput}
                value={customCommand}
                placeholder="Comando RCON personalizado..."
                onChange={(event) => setCustomCommand(event.currentTarget.value)}
              />
              <Tooltip label="Enviar RCON" withArrow>
                <ActionIcon
                  variant="filled"
                  size="lg"
                  aria-label="Enviar RCON"
                  onClick={() => {
                    if (customCommand.trim().length > 0) {
                      props.onRcon(customCommand.trim());
                      setCustomCommand("");
                    }
                  }}
                >
                  <Terminal size={16} />
                </ActionIcon>
              </Tooltip>
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
