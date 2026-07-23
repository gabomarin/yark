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
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import type { ServerInstallationInfo, ServerProfile, ServerRuntimeInfo } from "@shared/types";
import { useState } from "react";
import classes from "./ServerCard.module.css";

interface Props {
  server: ServerProfile;
  runtime: ServerRuntimeInfo | null;
  installation: ServerInstallationInfo | null;
  steamCmdBusy?: boolean;
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
  const { server, runtime, installation, steamCmdBusy = false } = props;
  const status = runtime?.status ?? "stopped";
  const isActive = status === "starting" || status === "running" || status === "stopping";
  const isInstallationReady = installation?.installed === true;
  const officialVersion = installation?.officialVersion ?? null;
  const localVersion = installation?.arkVersion ?? installation?.build ?? null;
  const updateAvailable =
    isInstallationReady && officialVersion !== null && localVersion !== null && officialVersion !== localVersion;
  const [customCommand, setCustomCommand] = useState("");

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
          <Badge color={status === "running" ? "green" : status === "error" ? "red" : "gray"} variant="light">
            {STATUS_LABEL[status] ?? status}
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
            value={!isInstallationReady ? "Sin instalar" : updateAvailable ? "Update available" : "Up to date"}
            tone={!isInstallationReady ? "muted" : updateAvailable ? "warn" : "ok"}
          />
        </SimpleGrid>

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