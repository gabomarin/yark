import { Tabs } from "@mantine/core";
import type {
  ServerInstallationInfo,
  ServerProfile,
  ServerProfileInput,
  ServerRuntimeInfo,
} from "@shared/types";
import { useCallback, useMemo, useRef, useState } from "react";
import { ConfigurationEditor } from "./components/ConfigurationEditor";
import { ServerListPanel } from "./components/ServerListPanel";
import { SidePanel } from "./components/SidePanel";
import { WorkspaceHeader } from "./components/WorkspaceHeader";
import classes from "./ServerWorkspacePage.module.css";

interface Props {
  servers: ServerProfile[];
  selectedServerId: string;
  statuses: Map<string, ServerRuntimeInfo>;
  installationInfo: Map<string, ServerInstallationInfo>;
  onSelectServer: (serverId: string) => void;
  onBack: () => void;
  onCreateServer?: () => void;
  onStartServer: (serverId: string) => void;
  onStopServer: (serverId: string) => void;
  onRestartServer: (serverId: string) => void;
  onKillServer: (serverId: string) => void;
  onOpenFolder: (serverId: string) => void;
  onInstallFiles: (serverId: string) => void;
  onUpdateNow: (serverId: string) => void;
  onSendRcon: (serverId: string, command: string) => void;
  onServerUpdated: () => void;
}

export function ServerWorkspacePage(props: Props): JSX.Element {
  const [workspaceTab, setWorkspaceTab] = useState<string | null>("configuration");
  const dirtyRef = useRef(false);

  const selectedServer = useMemo(() => {
    return (
      props.servers.find((server) => server.id === props.selectedServerId) ??
      props.servers[0] ??
      null
    );
  }, [props.selectedServerId, props.servers]);

  const confirmLeaveIfDirty = useCallback((action: () => void) => {
    if (!dirtyRef.current) {
      action();
      return;
    }
    const ok = window.confirm(
      "Hay cambios INI sin guardar. ¿Descartarlos y continuar?",
    );
    if (ok) {
      dirtyRef.current = false;
      action();
    }
  }, []);

  const handleSelectServer = (serverId: string) => {
    if (serverId === props.selectedServerId) return;
    confirmLeaveIfDirty(() => props.onSelectServer(serverId));
  };

  const handleBack = () => {
    confirmLeaveIfDirty(() => props.onBack());
  };

  const saveMods = async (mods: string[]) => {
    if (selectedServer === null) return;
    const input: ServerProfileInput = {
      name: selectedServer.name,
      map: selectedServer.map,
      installDir: selectedServer.installDir,
      sessionName: selectedServer.sessionName,
      gamePort: selectedServer.gamePort,
      queryPort: selectedServer.queryPort,
      rconPort: selectedServer.rconPort,
      serverPassword: selectedServer.serverPassword,
      adminPassword: selectedServer.adminPassword,
      clusterId: selectedServer.clusterId,
      clusterDir: selectedServer.clusterDir,
      extraArgs: selectedServer.extraArgs,
      mods,
    };
    const result = await window.api.updateServer(selectedServer.id, input);
    if (!result.ok) {
      throw new Error(result.error ?? "No se pudo actualizar mods");
    }
    props.onServerUpdated();
  };

  if (selectedServer === null) {
    return (
      <div className={classes.empty}>
        No hay servidores para editar. Crea uno desde Overview.
      </div>
    );
  }

  const runtime = props.statuses.get(selectedServer.id) ?? null;
  const installation = props.installationInfo.get(selectedServer.id) ?? null;

  return (
    <div className={classes.root}>
      <ServerListPanel
        servers={props.servers}
        selectedServerId={selectedServer.id}
        statuses={props.statuses}
        onSelectServer={handleSelectServer}
        onAddServer={props.onCreateServer}
      />

      <section className={classes.main}>
        <WorkspaceHeader
          server={selectedServer}
          runtime={runtime}
          installation={installation}
          onBack={handleBack}
          onStart={() => props.onStartServer(selectedServer.id)}
          onStop={() => props.onStopServer(selectedServer.id)}
          onRestart={() => props.onRestartServer(selectedServer.id)}
        />

        <Tabs
          value={workspaceTab}
          onChange={setWorkspaceTab}
          className={classes.tabs}
        >
          <Tabs.List>
            <Tabs.Tab value="configuration">Configuration</Tabs.Tab>
            <Tabs.Tab value="mods" disabled>
              Mods
            </Tabs.Tab>
            <Tabs.Tab value="files" disabled>
              Files
            </Tabs.Tab>
            <Tabs.Tab value="backups" disabled>
              Backups
            </Tabs.Tab>
            <Tabs.Tab value="logs" disabled>
              Logs
            </Tabs.Tab>
            <Tabs.Tab value="players" disabled>
              Players
            </Tabs.Tab>
            <Tabs.Tab value="console" disabled>
              Console
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="configuration" className={classes.tabPanel}>
            <ConfigurationEditor
              key={selectedServer.id}
              server={selectedServer}
              onModsChanged={saveMods}
              onDirtyChange={(dirty) => {
                dirtyRef.current = dirty;
              }}
            />
          </Tabs.Panel>
        </Tabs>
      </section>

      <SidePanel
        server={selectedServer}
        runtime={runtime}
        installation={installation}
        onOpenFolder={() => props.onOpenFolder(selectedServer.id)}
        onInstallFiles={() => props.onInstallFiles(selectedServer.id)}
        onUpdateNow={() => props.onUpdateNow(selectedServer.id)}
        onSaveWorld={() => props.onSendRcon(selectedServer.id, "SaveWorld")}
        onBroadcast={(message) =>
          props.onSendRcon(selectedServer.id, `Broadcast ${message}`)
        }
        onKill={() => props.onKillServer(selectedServer.id)}
      />
    </div>
  );
}
