import {
  ArrowsClockwise,
  CloudArrowDown,
  Copy,
  DotsThreeVertical,
  FileText,
  FolderOpen,
  GearSix,
  HardDrives,
  MagnifyingGlass,
  Pause,
  Play,
  ShieldCheck,
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
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import type { ServerInstallationInfo, ServerProfile, ServerRuntimeInfo } from "@shared/types";
import { formatSteamCmdByteProgress, steamCmdByteProgressNoun } from "@shared/steamcmd-progress";
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
  onCancelSteamCmd: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  stopped: "Detenido",
  starting: "Iniciando",
  running: "Activo",
  stopping: "Deteniendo",
  error: "Error",
};

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
  const installStateLabel = steamCmdBusy
    ? steamCmdOperation === "verify-files"
      ? "Verificando…"
      : steamCmdOperation === "update" || steamCmdOperation === "sync-files"
        ? "Actualizando…"
        : "Instalando…"
    : !isInstallationReady
      ? "Sin instalar"
      : updateAvailable
        ? "Actualización disponible"
        : "Actualizado";

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

  const primaryAction =
    steamCmdBusy
      ? {
          label: "Cancelar",
          icon: <XCircle size={16} />,
          color: "red",
          variant: "light" as const,
          disabled: false,
          onClick: props.onCancelSteamCmd,
        }
      : !isInstallationReady
        ? {
            label: "Instalar",
            icon: <CloudArrowDown size={16} />,
            color: "blue",
            variant: "filled" as const,
            disabled: false,
            onClick: props.onInstallFiles,
          }
        : status === "running"
          ? {
              label: "Administrar",
              icon: <GearSix size={16} />,
              color: "blue",
              variant: "filled" as const,
              disabled: false,
              onClick: props.onOpenWorkspace,
            }
          : status === "starting"
            ? {
                label: "Iniciando…",
                icon: <ArrowsClockwise size={16} />,
                color: "blue",
                variant: "light" as const,
                disabled: true,
                onClick: props.onOpenWorkspace,
              }
            : status === "stopping"
              ? {
                  label: "Deteniendo…",
                  icon: <ArrowsClockwise size={16} />,
                  color: "gray",
                  variant: "light" as const,
                  disabled: true,
                  onClick: props.onOpenWorkspace,
                }
              : status === "error"
                ? {
                    label: "Revisar error",
                    icon: <XCircle size={16} />,
                    color: "red",
                    variant: "light" as const,
                    disabled: false,
                    onClick: props.onOpenWorkspace,
                  }
                : updateAvailable
                  ? {
                      label: "Actualizar",
                      icon: <CloudArrowDown size={16} />,
                      color: "orange",
                      variant: "light" as const,
                      disabled: false,
                      onClick: props.onUpdateNow,
                    }
                  : {
                      label: "Iniciar",
                      icon: <Play size={16} weight="fill" />,
                      color: "teal",
                      variant: "light" as const,
                      disabled: false,
                      onClick: props.onStart,
                    };

  const rowTone =
    steamCmdBusy
      ? "busy"
      : status === "running"
        ? "running"
        : status === "error"
          ? "error"
          : !isInstallationReady || updateAvailable
            ? "attention"
            : "stopped";

  return (
    <Card
      withBorder
      className={classes.card}
      padding="md"
      radius="md"
      data-tone={rowTone}
      data-server-card
      data-server-name={server.name}
    >
      <Stack gap="sm">
        <div className={classes.mainRow}>
          <UnstyledButton
            className={classes.cardHit}
            onClick={openWorkspace}
            disabled={steamCmdBusy}
            aria-label={`Abrir configuración de ${server.name}`}
          >
            <Group gap="sm" align="center" wrap="nowrap" className={classes.identity}>
              <div className={classes.thumb}>
                <HardDrives size={18} weight="duotone" />
              </div>
              <div className={classes.identityText}>
                <Text className={classes.title} lineClamp={1}>
                  {server.name}
                </Text>
                <Text className={classes.subtitle} c="dimmed" lineClamp={1}>
                  {server.sessionName}
                </Text>
              </div>
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

            <div className={classes.metaGrid}>
              <MetaItem label="Mapa" value={server.map} />
              <MetaItem label="Cluster" value={server.clusterId ?? "—"} />
              <MetaItem label="Mods" value={String(server.mods.length)} />
              <MetaItem label="Versión" value={localVersion ?? "—"} />
              <MetaItem
                label="Archivos"
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
            </div>
          </UnstyledButton>

          <Group gap="xs" wrap="nowrap" className={classes.rowActions}>
            <Button
              size="sm"
              variant={primaryAction.variant}
              color={primaryAction.color}
              leftSection={primaryAction.icon}
              disabled={primaryAction.disabled}
              onClick={primaryAction.onClick}
              className={classes.primaryAction}
              data-primary-action
            >
              {primaryAction.label}
            </Button>

            <Menu shadow="md" withinPortal position="bottom-end">
              <Menu.Target>
                <Tooltip label="Más opciones" withArrow>
                  <ActionIcon
                    variant="default"
                    size="lg"
                    aria-label="Más opciones"
                    disabled={steamCmdBusy}
                  >
                    <DotsThreeVertical size={18} />
                  </ActionIcon>
                </Tooltip>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>Servidor</Menu.Label>
                <Menu.Item leftSection={<GearSix size={16} />} onClick={props.onOpenWorkspace}>
                  Abrir configuración
                </Menu.Item>
                {status === "running" && (
                  <>
                    <Menu.Item leftSection={<Pause size={16} />} onClick={props.onStop}>
                      Detener de forma segura
                    </Menu.Item>
                    <Menu.Item leftSection={<ArrowsClockwise size={16} />} onClick={props.onRestart}>
                      Reiniciar
                    </Menu.Item>
                  </>
                )}
                {status === "starting" && (
                  <Menu.Item leftSection={<Pause size={16} />} onClick={props.onStop}>
                    Detener
                  </Menu.Item>
                )}
                <Menu.Item leftSection={<FolderOpen size={16} />} onClick={props.onOpenFolder}>
                  Abrir carpeta
                </Menu.Item>
                <Menu.Item
                  leftSection={<FileText size={16} />}
                  onClick={props.onOpenLogs}
                  disabled={!isInstallationReady}
                >
                  Ver logs
                </Menu.Item>

                <Menu.Divider />
                <Menu.Label>Mantenimiento</Menu.Label>
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
          </Group>
        </div>

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
          <Text c="red" size="sm" className={classes.runtimeError}>
            {runtime.lastError}
          </Text>
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
      <Text c="dimmed" tt="uppercase" lts={0.04} display="block" fz="xs">
        {label}
      </Text>
      <Text className={classes[`metaValue-${tone}`]} display="block" lineClamp={1} fz="xs">
        {value}
      </Text>
    </div>
  );
}
