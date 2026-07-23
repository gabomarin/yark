import { Circle, CloudArrowDown, FolderOpen, ProhibitInset, TerminalWindow } from "@phosphor-icons/react";
import { Button, Card, Group, Stack, Text, Title } from "@mantine/core";
import { PageScaffold } from "@layout/PageScaffold/PageScaffold";
import { AppMetricCard } from "@ui/AppMetricCard/AppMetricCard";
import type { SteamCmdConsoleSnapshot, SteamCmdStatus } from "@shared/types";
import classes from "./SteamCmdPage.module.css";

interface Props {
  steamCmdStatus: SteamCmdStatus | null;
  steamCmdConsole: SteamCmdConsoleSnapshot | null;
  officialVersion: string | null;
  onInstallSteamCmd: () => void;
  onPickSteamCmdPath: () => void;
  onCancelSteamCmd: () => void;
}

export function SteamCmdPage(props: Props): JSX.Element {
  const detected = props.steamCmdStatus?.detected === true;
  const running = props.steamCmdStatus?.running === true;

  return (
    <PageScaffold
      title="SteamCMD"
      subtitle="Instalación, ruta del ejecutable y consola de operaciones"
      actions={
        <Group gap="sm">
          {detected ? (
            <Button variant="light" leftSection={<CloudArrowDown size={16} />} disabled>
              SteamCMD detectado
            </Button>
          ) : (
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
      <Stack gap="lg">
        <div className={classes.metrics}>
          <AppMetricCard
            icon={<Circle size={14} weight="fill" />}
            label="Estado"
            value={running ? "En ejecución" : "En espera"}
            hint={props.steamCmdStatus?.operation != null ? `Operación: ${props.steamCmdStatus.operation}` : "sin operación activa"}
          />
          <AppMetricCard
            icon={<CloudArrowDown size={14} />}
            label="Versión oficial"
            value={props.officialVersion ?? "No detectada"}
            hint={detected ? "SteamCMD disponible" : "SteamCMD no detectado"}
          />
        </div>

        <Card withBorder className={classes.pathCard}>
          <Stack gap="xs">
            <Title order={4}>Ruta configurada</Title>
            <Text c="dimmed">{props.steamCmdStatus?.executablePath ?? "No hay steamcmd.exe configurado todavía."}</Text>
          </Stack>
        </Card>

        <Card withBorder className={classes.consoleCard}>
          <Stack gap="sm">
            <Group gap="xs">
              <TerminalWindow size={18} />
              <Title order={4}>Consola SteamCMD</Title>
            </Group>
            {props.steamCmdConsole === null || props.steamCmdConsole.lines.length === 0 ? (
              <Text c="dimmed">Sin salida de SteamCMD todavía.</Text>
            ) : (
              <pre className={classes.console}>{props.steamCmdConsole.lines.join("\n")}</pre>
            )}
          </Stack>
        </Card>
      </Stack>
    </PageScaffold>
  );
}