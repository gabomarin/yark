import {
  ArrowsClockwise,
  CloudArrowDown,
  Copy,
  DotsThreeVertical,
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
  Menu,
  Progress,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import type { ServerInstallationInfo, ServerProfile, ServerRuntimeInfo } from "@shared/types";
import { formatSteamCmdByteProgress, steamCmdByteProgressNoun } from "@shared/steamcmd-progress";
import { useState, type KeyboardEvent, type MouseEvent, type SyntheticEvent } from "react";
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
    <div className={classes.actionSlot}>
      <Tooltip label={props.label} withArrow>
        <ActionIcon
          variant={props.color ? "light" : "subtle"}
          size="lg"
          color={props.color}
          disabled={props.disabled}
          loading={props.loading}
          onClick={props.onClick}
          aria-label={props.label}
          w="100%"
        >
          {props.children}
        </ActionIcon>
      </Tooltip>
    </div>
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

  const onCardKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openWorkspace();
    }
  };

  const stopCardNavigation = (event: SyntheticEvent) => {
    event.stopPropagation();
  };

  return (
    <Card withBorder className={classes.card} padding="sm" radius="md">
      <Stack gap="sm">
        <UnstyledButton
          className={classes.cardHit}
          onClick={openWorkspace}
          onKeyDown={onCardKeyDown}
          aria-label={`Abrir configuración de ${server.name}`}
        >
          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <Group gap="sm" align="flex-start" wrap="nowrap">
              <div className={classes.thumb}>
                <HardDrives size={18} weight="duotone" />
              </div>
              <div>
                <Text className={classes.title} lineClamp={1}>
                  {server.name}
                </Text>
                <Text className={classes.subtitle} c="dimmed" lineClamp={1}>
                  {server.sessionName}
                </Text>
              </div>
            </Group>
            <Badge
              size="xs"
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

          <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="xs" mt="sm">
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

        <Group
          gap={8}
          wrap="nowrap"
          className={classes.actions}
          onClick={stopCardNavigation}
          onKeyDown={stopCardNavigation}
        >
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
                label="Detener (guarda el mundo y cierra)"
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

              <div className={classes.actionSlot}>
                <Menu shadow="md" withinPortal position="bottom-end">
                  <Menu.Target>
                    <Tooltip label="Más opciones" withArrow>
                      <ActionIcon
                        variant="light"
                        color="gray"
                        size="lg"
                        w="100%"
                        aria-label="Más opciones"
                      >
                        <DotsThreeVertical size={18} />
                      </ActionIcon>
                    </Tooltip>
                  </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Label>Administración</Menu.Label>
                  <Menu.Item
                    leftSection={<FileText size={16} />}
                    onClick={props.onOpenLogs}
                    disabled={!isInstallationReady}
                  >
                    Ver logs
                  </Menu.Item>
                  {isInstallationReady ? (
                    <>
                      <Menu.Item
                        leftSection={<MagnifyingGlass size={16} />}
                        onClick={props.onCheckUpdates}
                        disabled={checkingUpdates}
                      >
                        Verificar actualizaciones
                      </Menu.Item>
                      <Menu.Item
                        leftSection={<CloudArrowDown size={16} />}
                        color={updateAvailable ? "orange" : undefined}
                        onClick={props.onUpdateNow}
                        disabled={isActive}
                      >
                        {isActive
                          ? "Actualizar (detén el servidor)"
                          : "Actualizar servidor"}
                      </Menu.Item>
                      <Menu.Item
                        leftSection={<ShieldCheck size={16} />}
                        onClick={props.onVerifyFiles}
                        disabled={isActive}
                      >
                        {isActive
                          ? "Verificar integridad (detén el servidor)"
                          : "Verificar integridad"}
                      </Menu.Item>
                    </>
                  ) : (
                    <Menu.Item
                      leftSection={<CloudArrowDown size={16} />}
                      onClick={props.onInstallFiles}
                    >
                      Instalar archivos
                    </Menu.Item>
                  )}
                  <Menu.Item leftSection={<Copy size={16} />} onClick={props.onClone}>
                    Clonar
                  </Menu.Item>

                  <Menu.Divider />
                  <Menu.Label>Peligro</Menu.Label>
                  <Menu.Item
                    color="red"
                    leftSection={<XCircle size={16} />}
                    onClick={props.onKill}
                    disabled={!isActive}
                  >
                    Forzar cierre (matar)
                  </Menu.Item>
                  <Menu.Item
                    color="red"
                    leftSection={<Trash size={16} />}
                    onClick={props.onDelete}
                    disabled={isActive}
                  >
                    {isActive ? "Eliminar (detén el servidor)" : "Eliminar servidor"}
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
              </div>
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
      <Text c="dimmed" tt="uppercase" lts={0.04} display="block" fz="micro">
        {label}
      </Text>
      <Text className={classes[`metaValue-${tone}`]} display="block" lineClamp={1} fz="xxs">
        {value}
      </Text>
    </div>
  );
}
