import { ProhibitInset, TerminalWindow } from "@phosphor-icons/react";
import { Button, Group, Progress, Stack, Text, Title } from "@mantine/core";
import { formatSteamCmdByteProgress } from "@shared/steamcmd-progress";
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
};

export function SteamCmdProgressDock(props: Props): JSX.Element {
  const { status } = props;
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
  const stateLabel = (() => {
    const raw = status.progressLabel ?? status.lastLine ?? "En curso…";
    // Evitar duplicar "Descargando · X MB" + "Descargado: X MB"
    if (byteProgress !== null && raw.includes(" · ")) {
      return raw.split(" · ")[0]!.trim();
    }
    return raw;
  })();

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
            <Text size="sm" mt={4}>
              {stateLabel}
            </Text>
            {byteProgress !== null && (
              <Text size="sm" fw={600} mt={2}>
                {byteProgress}
              </Text>
            )}
          </div>
          <Group gap="xs">
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
