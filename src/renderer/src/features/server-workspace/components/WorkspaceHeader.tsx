import {
  ArrowLeft,
  ArrowsClockwise,
  HardDrives,
  Play,
  Power,
  Wrench,
} from "@phosphor-icons/react";
import { ActionIcon, Badge, Button, Group, Stack, Text, Title, Tooltip } from "@mantine/core";
import type { ServerInstallationInfo, ServerProfile, ServerRuntimeInfo } from "@shared/types";
import classes from "./WorkspaceHeader.module.css";

interface Props {
  server: ServerProfile;
  runtime: ServerRuntimeInfo | null;
  installation: ServerInstallationInfo | null;
  onBack: () => void;
  onStart: () => void;
  onStop: () => void;
  onRestart: () => void;
  onOpenServerSwitcher?: () => void;
  onOpenServerActions?: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  stopped: "Detenido",
  starting: "Iniciando",
  running: "Activo",
  stopping: "Deteniendo",
  error: "Error",
};

export function WorkspaceHeader(props: Props): JSX.Element {
  const status = props.runtime?.status ?? "stopped";
  const version =
    props.installation?.arkVersion ??
    props.installation?.build ??
    props.installation?.version ??
    "—";
  const canStart = status === "stopped" || status === "error";
  const canStop = status === "running" || status === "starting";
  const canRestart = status === "running";

  return (
    <header className={classes.header}>
      <Group gap="sm" align="flex-start" wrap="nowrap" className={classes.identity}>
        <Tooltip label="Volver a servidores">
          <ActionIcon
            variant="subtle"
            color="gray"
            size="md"
            aria-label="Volver a servidores"
            onClick={props.onBack}
          >
            <ArrowLeft size={18} />
          </ActionIcon>
        </Tooltip>
        <Stack gap={2} style={{ minWidth: 0 }}>
          <Text className={classes.crumb} fz="xs" c="dimmed">
            Servidores / {props.server.name}
          </Text>
          <Group gap="xs" wrap="nowrap">
            <Title order={3} fz="lg" lineClamp={1}>
              {props.server.name}
            </Title>
            <Badge
              size="sm"
              variant="light"
              color={
                status === "running"
                  ? "green"
                  : status === "error"
                    ? "red"
                    : status === "starting" || status === "stopping"
                      ? "blue"
                      : "gray"
              }
            >
              {STATUS_LABEL[status] ?? status}
            </Badge>
          </Group>
          <Text size="xs" c="dimmed" lineClamp={1}>
            {props.server.map} · puerto {props.server.gamePort} · versión {version}
          </Text>
        </Stack>
      </Group>

      <Stack gap={7} align="flex-end" className={classes.controls}>
        <Group gap="xs" wrap="nowrap">
          <Button
            size="sm"
            leftSection={<Play size={14} weight="fill" />}
            onClick={props.onStart}
            disabled={!canStart}
          >
            Iniciar
          </Button>
          <Button
            size="sm"
            variant="light"
            leftSection={<ArrowsClockwise size={14} />}
            onClick={props.onRestart}
            disabled={!canRestart}
          >
            Reiniciar
          </Button>
          <Button
            size="sm"
            color="red"
            variant="light"
            leftSection={<Power size={14} />}
            onClick={props.onStop}
            disabled={!canStop}
          >
            Detener
          </Button>
        </Group>

        {props.onOpenServerSwitcher !== undefined &&
          props.onOpenServerActions !== undefined && (
            <Group gap={6} wrap="nowrap" className={classes.compactTools}>
              <Button
                size="compact-sm"
                variant="default"
                leftSection={<HardDrives size={14} />}
                onClick={props.onOpenServerSwitcher}
              >
                Cambiar servidor
              </Button>
              <Button
                size="compact-sm"
                variant="default"
                leftSection={<Wrench size={14} />}
                onClick={props.onOpenServerActions}
              >
                Estado y acciones
              </Button>
            </Group>
          )}
      </Stack>
    </header>
  );
}
