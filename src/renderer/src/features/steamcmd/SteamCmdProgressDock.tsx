import { useState } from "react";
import { CaretDown, CaretUp, ProhibitInset, TerminalWindow } from "@phosphor-icons/react";
import { ActionIcon, Button, Group, Progress, Stack, Text, Title, Tooltip } from "@mantine/core";
import { formatSteamCmdByteProgress, steamCmdByteProgressNoun } from "@shared/steamcmd-progress";
import type { SteamCmdConsoleSnapshot, SteamCmdStatus } from "@shared/types";
import { AutoScrollConsole } from "./AutoScrollConsole";
import classes from "./SteamCmdProgressDock.module.css";

interface Props {
  status: SteamCmdStatus;
  console: SteamCmdConsoleSnapshot | null;
  serverName?: string | null;
  onCancel: () => void;
  onOpenSteamCmdPage: () => void;
}

const OPERATION_LABEL: Record<NonNullable<SteamCmdStatus["operation"]>, string> = {
  "install-steamcmd": "Instalando SteamCMD",
  "install-files": "Instalando archivos",
  update: "Actualizando servidor",
  "sync-files": "Copiando archivos al servidor",
  "verify-files": "Verificando integridad",
};

export function SteamCmdProgressDock(props: Props): JSX.Element {
  const { status } = props;
  const [minimized, setMinimized] = useState(false);
  const title =
    status.operation !== null
      ? OPERATION_LABEL[status.operation]
      : "Operación SteamCMD";
  const percent = status.progressPercent;
  const lines = props.console?.lines ?? [];
  const byteProgress =
    status.progressBytesDownloaded !== null && status.progressBytesTotal !== null
      ? formatSteamCmdByteProgress(
          status.progressBytesDownloaded,
          status.progressBytesTotal,
        )
      : null;
  const byteNoun = steamCmdByteProgressNoun(status.operation);
  const stateLabel = (() => {
    const raw = status.progressLabel ?? status.lastLine ?? "En curso…";
    // Evitar duplicar "Verificando · X MB" + "Comprobado: X MB"
    if (byteProgress !== null && raw.includes(" · ")) {
      return raw.split(" · ")[0]!.trim();
    }
    return raw;
  })();
  const queueHint =
    status.queuedCount > 0
      ? ` · ${status.queuedCount} en cola`
      : "";

  if (minimized) {
    return (
      <aside className={`${classes.dock} ${classes.dockMinimized}`} aria-live="polite">
        <Group justify="space-between" align="center" wrap="nowrap" gap="sm">
          <Group gap="xs" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
            <TerminalWindow size={16} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <Text size="sm" fw={600} truncate>
                {title}
                {queueHint}
              </Text>
              <Text size="xs" c="dimmed" truncate>
                {props.serverName != null && props.serverName.length > 0
                  ? `${props.serverName} · `
                  : ""}
                {byteProgress !== null ? `${byteNoun}: ${byteProgress}` : stateLabel}
                {percent !== null ? ` · ${percent.toFixed(0)}%` : ""}
              </Text>
            </div>
          </Group>
          <Group gap={6} wrap="nowrap">
            <Progress
              value={percent ?? (status.busy ? 15 : 0)}
              animated={percent === null || percent < 100}
              striped={percent === null || percent < 100}
              size="sm"
              radius="xl"
              className={classes.miniProgress}
            />
            <Tooltip label="Expandir">
              <ActionIcon
                size="sm"
                variant="default"
                aria-label="Expandir panel de descarga"
                onClick={() => setMinimized(false)}
              >
                <CaretUp size={14} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Cancelar">
              <ActionIcon
                size="sm"
                color="red"
                variant="light"
                aria-label="Cancelar operación"
                onClick={props.onCancel}
              >
                <ProhibitInset size={14} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
      </aside>
    );
  }

  return (
    <aside className={classes.dock} aria-live="polite">
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <div>
            <Group gap="xs">
              <TerminalWindow size={18} />
              <Title order={5}>{title}</Title>
            </Group>
            {props.serverName != null && props.serverName.length > 0 && (
              <Text size="sm" c="dimmed">
                Servidor: {props.serverName}
              </Text>
            )}
            {status.queuedCount > 0 && (
              <Text size="xs" c="dimmed" mt={2}>
                {status.queuedCount} operación{status.queuedCount === 1 ? "" : "es"} en cola
                (se ejecutan una a una)
              </Text>
            )}
            <Text size="sm" mt={4}>
              {stateLabel}
            </Text>
            {byteProgress !== null && (
              <Text size="sm" fw={600} mt={2}>
                {byteNoun}: {byteProgress}
              </Text>
            )}
          </div>
          <Group gap="xs">
            <Tooltip label="Minimizar">
              <ActionIcon
                size="sm"
                variant="default"
                aria-label="Minimizar panel de descarga"
                onClick={() => setMinimized(true)}
              >
                <CaretDown size={14} />
              </ActionIcon>
            </Tooltip>
            <Button size="xs" variant="default" onClick={props.onOpenSteamCmdPage}>
              Ver SteamCMD
            </Button>
            <Button
              size="xs"
              color="red"
              variant="light"
              leftSection={<ProhibitInset size={14} />}
              onClick={props.onCancel}
            >
              Cancelar
            </Button>
          </Group>
        </Group>

        <Progress
          value={percent ?? (status.busy ? 15 : 0)}
          animated={percent === null || percent < 100}
          striped={percent === null || percent < 100}
          size="md"
          radius="xl"
        />
        {percent !== null && (
          <Text size="xs" c="dimmed" ta="right">
            {percent.toFixed(1)}%
          </Text>
        )}

        <AutoScrollConsole
          className={classes.console}
          lines={lines}
          maxLines={60}
          emptyText="Esperando salida de SteamCMD…"
        />
      </Stack>
    </aside>
  );
}
