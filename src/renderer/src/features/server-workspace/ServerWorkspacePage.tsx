import { Alert, Drawer, Tabs } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import type {
  ClusterComplianceReport,
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
import { ConfigurationWizard } from "./components/ConfigurationWizard";
import { ServerListPanel } from "./components/ServerListPanel";
import { ServerOnboardingChecklist } from "./components/ServerOnboardingChecklist";
import { SidePanel } from "./components/SidePanel";
import { WorkspaceHeader } from "./components/WorkspaceHeader";
import classes from "./ServerWorkspacePage.module.css";

type WorkspaceTab = "server" | ConfigSection;

function isConfigSection(tab: string | null): tab is ConfigSection {
  return tab === "iniFiles" || tab === "mods";
}

interface Props {
  servers: ServerProfile[];
  selectedServerId: string;
  statuses: Map<string, ServerRuntimeInfo>;
  installationInfo: Map<string, ServerInstallationInfo>;
  clusterReports: ClusterComplianceReport[];
  onboarding?: boolean;
  onDismissOnboarding?: () => void;
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
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(props.onboarding === true);
  const [iniEditorVersion, setIniEditorVersion] = useState(0);
  const [iniDirty, setIniDirty] = useState(false);
  const [serverSwitcherOpen, setServerSwitcherOpen] = useState(false);
  const [serverActionsOpen, setServerActionsOpen] = useState(false);
  const compactWorkspace = useMediaQuery("(max-width: 1599px)", false);
  const dirtyRef = useRef(false);
  const assistantDirtyRef = useRef(false);
  const lastConfigSectionRef = useRef<ConfigSection>("iniFiles");

  useEffect(() => {
    if (props.onboarding === true) {
      setShowOnboarding(true);
    }
  }, [props.onboarding, props.selectedServerId]);

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
    if (!dirtyRef.current && !assistantDirtyRef.current) {
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
        assistantDirtyRef.current = false;
        setIniDirty(false);
        action();
      },
    });
  }, []);

  const handleSelectServer = (serverId: string) => {
    if (serverId === props.selectedServerId) return;
    confirmLeaveIfDirty(() => {
      setAssistantOpen(false);
      props.onSelectServer(serverId);
      setServerSwitcherOpen(false);
    });
  };

  const handleBack = () => {
    confirmLeaveIfDirty(() => {
      setAssistantOpen(false);
      props.onBack();
    });
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
  const serverListPanel = (
    <ServerListPanel
      servers={props.servers}
      selectedServerId={selectedServer.id}
      statuses={props.statuses}
      onSelectServer={handleSelectServer}
      onAddServer={props.onCreateServer}
    />
  );
  const sidePanel = (
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
  );

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
        onOpenServerSwitcher={
          compactWorkspace ? () => setServerSwitcherOpen(true) : undefined
        }
        onOpenServerActions={
          compactWorkspace ? () => setServerActionsOpen(true) : undefined
        }
      />

      <div className={classes.body} data-compact={compactWorkspace || undefined}>
        {!compactWorkspace && serverListPanel}

        <section className={classes.main} data-workspace-scroll>
          {assistantOpen ? (
            <ConfigurationWizard
              server={selectedServer}
              serverActive={serverActive}
              onCancel={() => {
                assistantDirtyRef.current = false;
                setAssistantOpen(false);
              }}
              onApplied={() => {
                assistantDirtyRef.current = false;
                setIniDirty(false);
                setIniEditorVersion((current) => current + 1);
              }}
              onDraftChange={(dirty) => {
                assistantDirtyRef.current = dirty;
              }}
            />
          ) : showOnboarding ? (
            <ServerOnboardingChecklist
              server={selectedServer}
              servers={props.servers}
              installation={installation}
              clusterReports={props.clusterReports}
              onDismiss={() => {
                setShowOnboarding(false);
                props.onDismissOnboarding?.();
              }}
              onOpenAssistant={() => {
                if (!iniDirty) {
                  assistantDirtyRef.current = false;
                  setAssistantOpen(true);
                }
              }}
              onInstallFiles={() => props.onInstallFiles(selectedServer.id)}
              onServerUpdated={props.onServerUpdated}
            />
          ) : (
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
              <Tabs.Tab value="iniFiles">Archivos INI</Tabs.Tab>
              <Tabs.Tab value="mods">Mods</Tabs.Tab>
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
                  onOpenConfigurationAssistant={() => {
                    if (!iniDirty) {
                      assistantDirtyRef.current = false;
                      setAssistantOpen(true);
                    }
                  }}
                  configurationAssistantDisabled={iniDirty}
                />
              )}

              <div
                className={classes.configHost}
                data-visible={isConfigSection(workspaceTab) || undefined}
              >
                <ConfigurationEditor
                  key={`${selectedServer.id}:${iniEditorVersion}`}
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
                    setIniDirty(dirty);
                  }}
                />
              </div>
            </div>
          </Tabs>
          )}
        </section>

        {!compactWorkspace && sidePanel}
      </div>

      {compactWorkspace && (
        <>
          <Drawer
            opened={serverSwitcherOpen}
            onClose={() => setServerSwitcherOpen(false)}
            title="Cambiar servidor"
            position="left"
            size={320}
            overlayProps={{ backgroundOpacity: 0.68 }}
            classNames={{
              content: classes.drawerContent,
              header: classes.drawerHeader,
              body: classes.drawerBody,
            }}
          >
            <div className={classes.drawerPanel}>{serverListPanel}</div>
          </Drawer>

          <Drawer
            opened={serverActionsOpen}
            onClose={() => setServerActionsOpen(false)}
            title="Estado y acciones"
            position="right"
            size={340}
            overlayProps={{ backgroundOpacity: 0.68 }}
            classNames={{
              content: classes.drawerContent,
              header: classes.drawerHeader,
              body: classes.drawerBody,
            }}
          >
            <div className={classes.drawerPanel}>{sidePanel}</div>
          </Drawer>
        </>
      )}
    </div>
  );
}
