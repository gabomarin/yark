import { Tabs, Alert } from "@mantine/core";
import { modals } from "@mantine/modals";
import type {
  ServerInstallationInfo,
  ServerProfile,
  ServerProfileInput,
  ServerRuntimeInfo,
} from "@shared/types";
import { ServerForm } from "@features/servers/components/ServerForm/ServerForm";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ConfigurationEditor,
  type ConfigSection,
} from "./components/ConfigurationEditor";
import { ServerListPanel } from "./components/ServerListPanel";
import { SidePanel } from "./components/SidePanel";
import { WorkspaceHeader } from "./components/WorkspaceHeader";
import classes from "./ServerWorkspacePage.module.css";

type WorkspaceTab = "server" | ConfigSection;

function isConfigSection(tab: string | null): tab is ConfigSection {
  return (
    tab === "game" ||
    tab === "gameUserSettings" ||
    tab === "mods" ||
    tab === "advanced"
  );
}

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
  onVerifyFiles: (serverId: string) => void;
  onSendRcon: (serverId: string, command: string) => void;
  onServerUpdated: () => void;
}

function isServerActive(runtime: ServerRuntimeInfo | null): boolean {
  const status = runtime?.status ?? "stopped";
  return status === "starting" || status === "running" || status === "stopping";
}

export function ServerWorkspacePage(props: Props): JSX.Element {
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("server");
  const dirtyRef = useRef(false);
  const lastConfigSectionRef = useRef<ConfigSection>("gameUserSettings");

  useEffect(() => {
    if (isConfigSection(workspaceTab)) {
      lastConfigSectionRef.current = workspaceTab;
    }
  }, [workspaceTab]);

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
    modals.openConfirmModal({
      title: "Cambios sin guardar",
      children: (
        <Alert color="yellow" title="INI modificados" variant="light">
          Hay cambios en la configuración INI sin guardar. Si continúas, se descartarán.
        </Alert>
      ),
      labels: { confirm: "Descartar y continuar", cancel: "Seguir editando" },
      confirmProps: { color: "yellow" },
      onConfirm: () => {
        dirtyRef.current = false;
        action();
      },
    });
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
        No hay servidores para editar. Crea uno desde Servidores.
      </div>
    );
  }

  const runtime = props.statuses.get(selectedServer.id) ?? null;
  const installation = props.installationInfo.get(selectedServer.id) ?? null;
  const serverActive = isServerActive(runtime);

  return (
    <div className={classes.root}>
      <WorkspaceHeader
        server={selectedServer}
        runtime={runtime}
        installation={installation}
        onBack={handleBack}
        onStart={() => props.onStartServer(selectedServer.id)}
        onStop={() => props.onStopServer(selectedServer.id)}
        onRestart={() => props.onRestartServer(selectedServer.id)}
      />

      <div className={classes.body}>
        <ServerListPanel
          servers={props.servers}
          selectedServerId={selectedServer.id}
          statuses={props.statuses}
          onSelectServer={handleSelectServer}
          onAddServer={props.onCreateServer}
        />

        <section className={classes.main} data-workspace-scroll>
          <Tabs
            value={workspaceTab}
            onChange={(value) => {
              if (value === null) return;
              setWorkspaceTab(value as WorkspaceTab);
            }}
            className={classes.tabs}
          >
            <Tabs.List className={classes.tabList}>
              <Tabs.Tab value="server">Servidor</Tabs.Tab>
              <Tabs.Tab value="game">Game.ini</Tabs.Tab>
              <Tabs.Tab value="gameUserSettings">GameUserSettings.ini</Tabs.Tab>
              <Tabs.Tab value="mods">Mods</Tabs.Tab>
              <Tabs.Tab value="advanced">Avanzado</Tabs.Tab>
            </Tabs.List>

            <div className={classes.tabPanel}>
              {workspaceTab === "server" && (
                <ServerForm
                  key={`${selectedServer.id}:${selectedServer.updatedAt}`}
                  initial={selectedServer}
                  variant="embedded"
                  serverActive={serverActive}
                  onCancel={handleBack}
                  onSaved={props.onServerUpdated}
                />
              )}

              <div
                className={classes.configHost}
                data-visible={isConfigSection(workspaceTab) || undefined}
              >
                <ConfigurationEditor
                  key={selectedServer.id}
                  server={selectedServer}
                  section={
                    isConfigSection(workspaceTab)
                      ? workspaceTab
                      : lastConfigSectionRef.current
                  }
                  serverActive={serverActive}
                  onModsChanged={saveMods}
                  onDirtyChange={(dirty) => {
                    dirtyRef.current = dirty;
                  }}
                />
              </div>
            </div>
          </Tabs>
        </section>

        <SidePanel
          server={selectedServer}
          runtime={runtime}
          installation={installation}
          onOpenFolder={() => props.onOpenFolder(selectedServer.id)}
          onInstallFiles={() => props.onInstallFiles(selectedServer.id)}
          onUpdateNow={() => props.onUpdateNow(selectedServer.id)}
          onVerifyFiles={() => props.onVerifyFiles(selectedServer.id)}
          onSaveWorld={() => props.onSendRcon(selectedServer.id, "SaveWorld")}
          onBroadcast={(message) =>
            props.onSendRcon(selectedServer.id, `Broadcast ${message}`)
          }
          onKill={() => props.onKillServer(selectedServer.id)}
        />
      </div>
    </div>
  );
}
