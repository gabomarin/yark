import {
  CheckCircle,
  CloudArrowDown,
  Database,
  FolderOpen,
  HardDrive,
  ProhibitInset,
  TerminalWindow,
} from "@phosphor-icons/react";
import { Badge, Button, Card, Group, Progress, Stack, Text, Title } from "@mantine/core";
import { PageScaffold } from "@layout/PageScaffold/PageScaffold";
import { formatSteamCmdByteProgress, steamCmdByteProgressNoun } from "@shared/steamcmd-progress";
import type { SteamCmdConsoleSnapshot, SteamCmdStatus } from "@shared/types";
import { AutoScrollConsole } from "./AutoScrollConsole";
import classes from "./SteamCmdPage.module.css";

interface Props {
  steamCmdStatus: SteamCmdStatus | null;
  steamCmdConsole: SteamCmdConsoleSnapshot | null;
  officialVersion: string | null;
  onInstallSteamCmd: () => void;
  onPickSteamCmdPath: () => void;
  onCancelSteamCmd: () => void;
}

const OPERATION_LABEL: Record<NonNullable<SteamCmdStatus["operation"]>, string> = {
  "install-steamcmd": "Instalando SteamCMD",
  "install-files": "Instalando archivos",
  update: "Actualizando servidor",
  "sync-files": "Copiando archivos",
  "verify-files": "Verificando integridad",
};

export function SteamCmdPage(props: Props): JSX.Element {
  const detected = props.steamCmdStatus?.detected === true;
  const running = props.steamCmdStatus?.busy === true || props.steamCmdStatus?.running === true;
  const operation = props.steamCmdStatus?.operation ?? null;
  const percent = props.steamCmdStatus?.progressPercent ?? null;
  const progressBytes =
    props.steamCmdStatus?.progressBytesDownloaded != null
    && props.steamCmdStatus.progressBytesTotal != null
      ? formatSteamCmdByteProgress(
          props.steamCmdStatus.progressBytesDownloaded,
          props.steamCmdStatus.progressBytesTotal,
        )
      : null;
  const operationTitle = running
    ? operation !== null
      ? OPERATION_LABEL[operation]
      : "Operación en curso"
    : detected
      ? "SteamCMD listo"
      : "SteamCMD no configurado";
  const operationDescription = running
    ? props.steamCmdStatus?.progressLabel
      ?? props.steamCmdStatus?.lastLine
      ?? "Preparando la operación…"
    : detected
      ? "Disponible para instalar, actualizar y verificar servidores."
      : "Instálalo automáticamente o selecciona un ejecutable existente.";

  return (
    <PageScaffold
      title="SteamCMD"
      subtitle="Instalación, ruta del ejecutable y consola de operaciones"
      fillViewport
      actions={
        <Group gap="sm" wrap="wrap">
          {!detected && (
            <Button leftSection={<CloudArrowDown size={16} />} onClick={props.onInstallSteamCmd}>
              Instalar SteamCMD
            </Button>
          )}
          <Button variant="default" leftSection={<FolderOpen size={16} />} onClick={props.onPickSteamCmdPath}>
            Elegir steamcmd.exe
          </Button>
          {running && (
            <Button color="red" variant="light" leftSection={<ProhibitInset size={16} />} onClick={props.onCancelSteamCmd}>
              Cancelar operación
            </Button>
          )}
        </Group>
      }
    >
      <Stack gap="md" className={classes.steamContent} data-steamcmd-page>
        <Card
          withBorder
          className={classes.operationCard}
          data-tone={running ? "busy" : detected ? "ready" : "attention"}
        >
          <Stack gap="sm">
            <Group justify="space-between" align="center" wrap="nowrap">
              <Group gap="sm" wrap="nowrap" className={classes.operationIdentity}>
                <div className={classes.operationIcon}>
                  {detected ? <CheckCircle size={20} weight="fill" /> : <CloudArrowDown size={20} />}
                </div>
                <div className={classes.operationCopy}>
                  <Group gap="xs" wrap="wrap">
                    <Title order={3} size="h4">{operationTitle}</Title>
                    <Badge
                      size="sm"
                      variant="light"
                      color={running ? "blue" : detected ? "green" : "yellow"}
                    >
                      {running ? "En curso" : detected ? "Disponible" : "Requiere configuración"}
                    </Badge>
                  </Group>
                  <Text size="sm" c="dimmed" truncate>{operationDescription}</Text>
                </div>
              </Group>
              {running && (
                <div className={classes.progressValue}>
                  <Text fw={700}>{percent !== null ? `${percent.toFixed(0)}%` : "…"}</Text>
                  {props.steamCmdStatus?.queuedCount != null && props.steamCmdStatus.queuedCount > 0 && (
                    <Text size="xs" c="dimmed">{props.steamCmdStatus.queuedCount} en cola</Text>
                  )}
                </div>
              )}
            </Group>
            {running && (
              <div className={classes.progressBlock}>
                <Group justify="space-between" gap="sm" wrap="nowrap">
                  <Text size="xs" c="dimmed" truncate>
                    {progressBytes !== null
                      ? `${steamCmdByteProgressNoun(operation)}: ${progressBytes}`
                      : operationDescription}
                  </Text>
                  {percent !== null && <Text size="xs" c="dimmed">{percent.toFixed(1)}%</Text>}
                </Group>
                <Progress
                  value={percent ?? 15}
                  animated={percent === null || percent < 100}
                  striped={percent === null || percent < 100}
                  size="sm"
                  radius="xl"
                  mt={6}
                />
              </div>
            )}
          </Stack>
        </Card>

        <div className={classes.contextStrip} aria-label="Entorno SteamCMD">
          <ContextItem
            icon={<CloudArrowDown size={16} />}
            label="Versión oficial"
            value={props.officialVersion ?? "No disponible"}
          />
          <ContextItem
            icon={<FolderOpen size={16} />}
            label="Ejecutable"
            value={props.steamCmdStatus?.executablePath ?? "Sin configurar"}
          />
          <ContextItem
            icon={<Database size={16} />}
            label="Depotcache"
            value={props.steamCmdStatus?.depotCacheDir ?? "Sin configurar"}
          />
          <ContextItem
            icon={<HardDrive size={16} />}
            label="Contenido ASA"
            value={props.steamCmdStatus?.contentCacheDir ?? "Sin configurar"}
          />
        </div>

        <Card withBorder className={classes.consoleCard}>
          <Stack gap="sm" className={classes.consoleStack}>
            <Group justify="space-between" gap="sm">
              <Group gap="xs">
                <TerminalWindow size={18} />
                <Title order={3} size="h4">Consola SteamCMD</Title>
              </Group>
              <Text size="xs" c="dimmed">Últimas 200 líneas</Text>
            </Group>
            <AutoScrollConsole
              className={classes.console}
              lines={props.steamCmdConsole?.lines ?? []}
              maxLines={200}
              emptyText="Sin salida de SteamCMD todavía."
            />
          </Stack>
        </Card>
      </Stack>
    </PageScaffold>
  );
}

interface ContextItemProps {
  icon: React.ReactNode;
  label: string;
  value: string;
}

function ContextItem({ icon, label, value }: ContextItemProps): JSX.Element {
  return (
    <div className={classes.contextItem} title={value}>
      <Text className={classes.contextLabel}>{icon}{label}</Text>
      <Text size="xs" className={classes.contextValue}>{value}</Text>
    </div>
  );
}
