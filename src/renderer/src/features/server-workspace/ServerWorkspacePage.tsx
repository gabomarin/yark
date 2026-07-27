import { Alert, Drawer, Tabs } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import type {
  ClusterComplianceReport,
  ServerInstallationInfo,
  ServerProfile,
  ServerRuntimeInfo,
} from "@shared/types";
import { ServerBackupPanel } from "@features/backups/ServerBackupPanel";
import {
  ServerLogsPanel,
  type ServerLogsFocus,
} from "@features/logs/ServerLogsPanel";
import { ServerForm } from "@features/servers/components/ServerForm/ServerForm";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ConfigurationEditor,
} from "./components/ConfigurationEditor/ConfigurationEditor";
import { ConfigurationWizard } from "./components/ConfigurationWizard/ConfigurationWizard";
import { ServerListPanel } from "./components/ServerListPanel/ServerListPanel";
import { ServerOnboardingChecklist } from "./components/ServerOnboardingChecklist/ServerOnboardingChecklist";
import { SidePanel } from "./components/SidePanel/SidePanel";
import { WorkspaceHeader } from "./components/WorkspaceHeader/WorkspaceHeader";
import classes from "./ServerWorkspacePage.module.css";

export type WorkspaceTab = "server" | "iniFiles" | "backups" | "logs";

interface Props {
  servers: ServerProfile[];
  selectedServerId: string;
  statuses: Map<string, ServerRuntimeInfo>;
  installationInfo: Map<string, ServerInstallationInfo>;
  clusterReports: ClusterComplianceReport[];
  onboarding?: boolean;
  /** Opens a specific workspace tab (e.g. from sidebar Backup settings). */
  initialTab?: WorkspaceTab;
  /** One-shot focus for the Logs tab (section / event / update file). */
  logsFocus?: ServerLogsFocus | null;
  onLogsFocusConsumed?: () => void;
  /** SteamCMD is rewriting this server's install (install/update/verify/sync). */
  filesJobActive?: boolean;
  filesJobLabel?: string | null;
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
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>(
    props.initialTab ?? "server",
  );
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(props.onboarding === true);
  const [iniEditorVersion, setIniEditorVersion] = useState(0);
  const [iniDirty, setIniDirty] = useState(false);
  const [serverSwitcherOpen, setServerSwitcherOpen] = useState(false);
  const [serverActionsOpen, setServerActionsOpen] = useState(false);
  const compactWorkspace = useMediaQuery("(max-width: 1599px)", false);
  const dirtyRef = useRef(false);
  const assistantDirtyRef = useRef(false);

  useEffect(() => {
    if (props.onboarding === true) {
      setShowOnboarding(true);
    }
  }, [props.onboarding, props.selectedServerId]);

  useEffect(() => {
    if (props.initialTab !== undefined) {
      setWorkspaceTab(props.initialTab);
    }
  }, [props.initialTab]);

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
      title: "Unsaved changes",
      children: (
        <Alert color="yellow" title="INI modified" variant="light">
          There are unsaved INI configuration changes. If you continue, they will be discarded.
        </Alert>
      ),
      labels: { confirm: "Discard and continue", cancel: "Keep editing" },
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

  if (selectedServer === null) {
    return (
      <div className={classes.empty}>
        No servers to edit. Create one from Servers.
      </div>
    );
  }

  const runtime = props.statuses.get(selectedServer.id) ?? null;
  const installation = props.installationInfo.get(selectedServer.id) ?? null;
  const serverActive = isServerActive(runtime);
  const filesJobActive = props.filesJobActive === true;
  /** Same operational lock as a running server, plus SteamCMD file jobs. */
  const opsLocked = serverActive || filesJobActive;
  const filesLockReason =
    props.filesJobLabel?.trim() ||
    "SteamCMD is modifying this server's files";
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
      opsLocked={filesJobActive}
      opsLockReason={filesJobActive ? filesLockReason : undefined}
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
        filesJobActive={filesJobActive}
        filesJobReason={filesLockReason}
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
          {filesJobActive && (
            <Alert color="yellow" title="Files job in progress" mb="sm">
              {filesLockReason}. Install/update/verify, start/restart, install path,
              and restore are locked (same idea as when the server is running).
            </Alert>
          )}
          {assistantOpen ? (
            <ConfigurationWizard
              server={selectedServer}
              serverActive={opsLocked}
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
              <Tabs.Tab value="server">Server</Tabs.Tab>
              <Tabs.Tab value="iniFiles">INI Files</Tabs.Tab>
              <Tabs.Tab value="backups">Backups</Tabs.Tab>
              <Tabs.Tab value="logs">Logs</Tabs.Tab>
            </Tabs.List>

            <div className={classes.tabPanel}>
              {workspaceTab === "server" && (
                <ServerForm
                  key={`${selectedServer.id}:${selectedServer.updatedAt}`}
                  initial={selectedServer}
                  variant="embedded"
                  serverActive={opsLocked}
                  filesJobActive={filesJobActive}
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
                data-visible={workspaceTab === "iniFiles" || undefined}
              >
                <ConfigurationEditor
                  key={`${selectedServer.id}:${iniEditorVersion}`}
                  server={selectedServer}
                  section="iniFiles"
                  serverActive={opsLocked}
                  filesJobActive={filesJobActive}
                  onDirtyChange={(dirty) => {
                    dirtyRef.current = dirty;
                    setIniDirty(dirty);
                  }}
                />
              </div>

              {workspaceTab === "backups" && (
                <ServerBackupPanel
                  server={selectedServer}
                  runtime={runtime}
                  embedded
                  opsLocked={opsLocked}
                  opsLockReason={filesJobActive ? filesLockReason : undefined}
                />
              )}

              {workspaceTab === "logs" && (
                <ServerLogsPanel
                  server={selectedServer}
                  embedded
                  focus={props.logsFocus}
                  onFocusConsumed={props.onLogsFocusConsumed}
                />
              )}
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
            title="Switch server"
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
            title="Status and actions"
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
