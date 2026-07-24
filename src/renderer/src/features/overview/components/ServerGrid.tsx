import { Card, Stack, Text, Title } from "@mantine/core";
import type { ServerInstallationInfo, ServerProfile, ServerRuntimeInfo } from "@shared/types";
import { ServerCard } from "@features/servers/components/ServerCard/ServerCard";
import classes from "../OverviewPage.module.css";

interface Props {
  servers: ServerProfile[];
  filteredServers: ServerProfile[];
  statuses: Map<string, ServerRuntimeInfo>;
  installationInfo: Map<string, ServerInstallationInfo>;
  steamCmdServerId: string | null;
  steamCmdRunning: boolean;
  steamCmdBusy?: boolean;
  steamCmdProgressPercent?: number | null;
  steamCmdProgressLabel?: string | null;
  steamCmdProgressBytesDownloaded?: number | null;
  steamCmdProgressBytesTotal?: number | null;
  steamCmdOperation?: "install-steamcmd" | "install-files" | "update" | "sync-files" | "verify-files" | null;
  onEditServer: (server: ServerProfile) => void;
  onOpenIni: (server: ServerProfile) => void;
  onOpenLogs: (serverId: string) => void;
  onStartServer: (serverId: string) => void;
  onStopServer: (serverId: string) => void;
  onRestartServer: (serverId: string) => void;
  onKillServer: (serverId: string) => void;
  onOpenFolder: (serverId: string) => void;
  onInstallFiles: (serverId: string) => void;
  onUpdateNow: (serverId: string) => void;
  onVerifyFiles: (serverId: string) => void;
  onCloneServer: (serverId: string) => void;
  onDeleteServer: (serverId: string) => void;
  onSendRcon: (serverId: string, command: string) => void;
  onCancelSteamCmd: () => void;
}

export function ServerGrid(props: Props): JSX.Element {
  return (
    <Card withBorder className={classes.sectionCard}>
      <Stack gap="md">
        <Title order={3}>
          Servidores ({props.filteredServers.length}
          {props.filteredServers.length !== props.servers.length ? ` de ${props.servers.length}` : ""})
        </Title>

        {props.servers.length === 0 && (
          <Text c="dimmed">No hay servidores configurados. Crea el primero con “Nuevo servidor”.</Text>
        )}
        {props.servers.length > 0 && props.filteredServers.length === 0 && (
          <Text c="dimmed">Ningún servidor coincide con la búsqueda actual.</Text>
        )}

        <div className={classes.serverGrid}>
          {props.filteredServers.map((server) => (
            <ServerCard
              key={server.id}
              server={server}
              runtime={props.statuses.get(server.id) ?? null}
              installation={props.installationInfo.get(server.id) ?? null}
              steamCmdBusy={
                (props.steamCmdBusy ?? props.steamCmdRunning)
                && props.steamCmdServerId === server.id
              }
              steamCmdProgressPercent={
                props.steamCmdServerId === server.id ? (props.steamCmdProgressPercent ?? null) : null
              }
              steamCmdProgressLabel={
                props.steamCmdServerId === server.id ? (props.steamCmdProgressLabel ?? null) : null
              }
              steamCmdProgressBytesDownloaded={
                props.steamCmdServerId === server.id
                  ? (props.steamCmdProgressBytesDownloaded ?? null)
                  : null
              }
              steamCmdProgressBytesTotal={
                props.steamCmdServerId === server.id
                  ? (props.steamCmdProgressBytesTotal ?? null)
                  : null
              }
              steamCmdOperation={
                props.steamCmdServerId === server.id ? (props.steamCmdOperation ?? null) : null
              }
              onStart={() => props.onStartServer(server.id)}
              onStop={() => props.onStopServer(server.id)}
              onKill={() => props.onKillServer(server.id)}
              onRestart={() => props.onRestartServer(server.id)}
              onEdit={() => props.onEditServer(server)}
              onOpenIni={() => props.onOpenIni(server)}
              onOpenLogs={() => props.onOpenLogs(server.id)}
              onOpenFolder={() => props.onOpenFolder(server.id)}
              onInstallFiles={() => props.onInstallFiles(server.id)}
              onUpdateNow={() => props.onUpdateNow(server.id)}
              onVerifyFiles={() => props.onVerifyFiles(server.id)}
              onClone={() => props.onCloneServer(server.id)}
              onDelete={() => props.onDeleteServer(server.id)}
              onRcon={(command) => props.onSendRcon(server.id, command)}
              onCancelSteamCmd={props.onCancelSteamCmd}
            />
          ))}
        </div>
      </Stack>
    </Card>
  );
}