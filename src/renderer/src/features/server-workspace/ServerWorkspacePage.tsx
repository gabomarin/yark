import { Alert } from "@mantine/core";
import { HardDrives } from "@phosphor-icons/react";
import { useMediaQuery } from "@mantine/hooks";
import type { ServerRuntimeInfo } from "@shared/types";
import type { ReactElement } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ConfigurationWizard } from "./components/ConfigurationWizard/ConfigurationWizard";
import { ServerListPanel } from "./components/ServerListPanel/ServerListPanel";
import { ServerOnboardingChecklist } from "./components/ServerOnboardingChecklist/ServerOnboardingChecklist";
import { SidePanel } from "./components/SidePanel/SidePanel";
import { WorkspaceSplitBody } from "./components/WorkspaceSplitBody/WorkspaceSplitBody";
import { WorkspaceTabs } from "./components/WorkspaceTabs/WorkspaceTabs";
import { WorkspaceHeader } from "./components/WorkspaceHeader/WorkspaceHeader";
import { StopProgressAlert, stopProgressForServer } from "./components/StopProgressAlert";
import type { WorkspaceTab } from "./serverWorkspaceTypes";
import { EmptyState } from "@ui/EmptyState/EmptyState";
import { WorkspaceCompactDrawers } from "./components/WorkspaceCompactDrawers/WorkspaceCompactDrawers";
import { useWorkspaceLeaveGuard } from "./useWorkspaceLeaveGuard";
import { useWorkspaceStatusPanelVisible } from "./useWorkspaceStatusPanelVisible";
import type { ServerWorkspacePageProps } from "./serverWorkspacePageProps";
import classes from "./ServerWorkspacePage.module.css";

export type { RconHistoryEntry, WorkspaceTab } from "./serverWorkspaceTypes";

function isServerActive(runtime: ServerRuntimeInfo | null): boolean {
  const status = runtime?.status ?? "stopped";
  return status === "starting" || status === "running" || status === "stopping";
}

export function ServerWorkspacePage(props: ServerWorkspacePageProps): ReactElement {
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>(
    props.initialTab ?? "server",
  );
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(props.onboarding === true);
  const [iniEditorVersion, setIniEditorVersion] = useState(0);
  const [serverSwitcherOpen, setServerSwitcherOpen] = useState(false);
  const [serverActionsOpen, setServerActionsOpen] = useState(false);
  const compactWorkspace = useMediaQuery("(max-width: 1599px)", false);
  const {
    iniDirty,
    setIniDirty,
    assistantDirtyRef,
    onProfileDirtyChange,
    registerProfileLeaveGuard,
    registerProfileSave,
    registerIniSave,
    confirmLeaveIfDirty,
  } = useWorkspaceLeaveGuard(props.onRegisterLeaveGuard, () => {
    setAssistantOpen(false);
    setServerSwitcherOpen(false);
  });

  const onAssistantDraftChange = useCallback((dirty: boolean) => {
    assistantDirtyRef.current = dirty;
  }, [assistantDirtyRef]);

  useWorkspaceStatusPanelVisible(
    compactWorkspace,
    serverActionsOpen,
    props.onStatusPanelVisibleChange,
  );

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

  const handleSelectServer = (serverId: string) => {
    if (serverId === props.selectedServerId) return;
    confirmLeaveIfDirty(() => {
      props.onSelectServer(serverId);
    });
  };

  const handleBack = () => {
    confirmLeaveIfDirty(() => {
      props.onBack();
    });
  };
  if (selectedServer === null) {
    return (
      <EmptyState
        layout="stacked"
        icon={<HardDrives size={24} />}
        title="No servers to edit"
        description="Create one from Servers."
      />
    );
  }
  const runtime = props.statuses.get(selectedServer.id) ?? null;
  const installation = props.installationInfo.get(selectedServer.id) ?? null;
  const serverActive = isServerActive(runtime);
  const filesJobActive = props.filesJobActive === true;
  const stopProgress = stopProgressForServer(props.stopProgress, selectedServer.id);
  const stopJobActive = stopProgress !== null;
  /** Same operational lock as a running server, plus SteamCMD file jobs. */
  const opsLocked = serverActive || filesJobActive || stopJobActive;
  const filesLockReason = props.filesJobLabel?.trim() || "Updating server files";
  const stopLockReason = stopProgress?.label.trim() || "Stopping this server…";
  const renderServerList = (
    options: { iconMode?: boolean; onToggleRail?: () => void } = {},
  ) => (
    <ServerListPanel
      servers={props.servers}
      selectedServerId={selectedServer.id}
      statuses={props.statuses}
      iconMode={options.iconMode === true}
      onToggleRail={options.onToggleRail}
      onSelectServer={handleSelectServer}
    />
  );
  const sidePanel = (
    <SidePanel
      server={selectedServer}
      runtime={runtime}
      installation={installation}
      playerList={props.playerList}
      processMetrics={props.processMetrics}
      opsLocked={filesJobActive || stopJobActive}
      opsLockReason={
        stopJobActive
          ? stopLockReason
          : filesJobActive
            ? filesLockReason
            : undefined
      }
      filesJobOperation={props.filesJobOperation}
      filesJobQueueKind={props.filesJobQueueKind}
      onOpenFolder={() => props.onOpenFolder(selectedServer.id)}
      onInstallFiles={() => props.onInstallFiles(selectedServer.id)}
      onUpdateNow={() => props.onUpdateNow(selectedServer.id)}
      onVerifyFiles={() => props.onVerifyFiles(selectedServer.id)}
      onSaveWorld={() => {
        void props.onSendRcon(selectedServer.id, "SaveWorld");
      }}
      onCopyConfiguration={() => props.onCopyConfiguration(selectedServer.id)}
      onKill={() => props.onKillServer(selectedServer.id)}
      onToggleEnabled={() =>
        props.onToggleServerEnabled?.(selectedServer.id, !selectedServer.enabled)
      }
    />
  );

  const mainSection = (
    <section className={classes.main} data-workspace-scroll>
      {stopProgress !== null && <StopProgressAlert progress={stopProgress} />}
      {filesJobActive && (
        <Alert color="yellow" title={filesLockReason} mb="sm">
          Start, restore, and other file actions stay locked until this finishes.
        </Alert>
      )}
      {assistantOpen ? (
        <ConfigurationWizard
          server={selectedServer}
          serverActive={opsLocked}
          onboarding={showOnboarding}
          onCancel={() => {
            assistantDirtyRef.current = false;
            setAssistantOpen(false);
          }}
          onApplied={() => {
            assistantDirtyRef.current = false;
            setIniDirty(false);
            setIniEditorVersion((current) => current + 1);
          }}
          onDraftChange={onAssistantDraftChange}
        />
      ) : showOnboarding ? (
        <ServerOnboardingChecklist
          server={selectedServer}
          installation={installation}
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
        />
      ) : (
        <WorkspaceTabs
          value={workspaceTab}
          server={selectedServer}
          servers={props.servers}
          runtime={runtime}
          installation={installation}
          events={props.events}
          rconHistory={props.rconHistory}
          playerList={props.playerList}
          opsLocked={opsLocked}
          filesJobActive={filesJobActive}
          stopJobActive={stopJobActive}
          filesLockReason={filesLockReason}
          stopLockReason={stopLockReason}
          startBusy={props.startBusy === true}
          iniDirty={iniDirty}
          iniEditorVersion={iniEditorVersion}
          logsFocus={props.logsFocus}
          onChange={(tab) => {
            if (tab === workspaceTab) return;
            // Leave-guard callback is not a React setState updater (#403).
            confirmLeaveIfDirty(() => {
              setWorkspaceTab(tab);
            }, "tab");
          }}
          onBack={handleBack}
          onOpenAssistant={() => {
            if (iniDirty) return;
            confirmLeaveIfDirty(() => {
              assistantDirtyRef.current = false;
              setAssistantOpen(true);
            }, "tab");
          }}
          onIniDirtyChange={setIniDirty}
          onRegisterProfileLeaveGuard={registerProfileLeaveGuard}
          onProfileDirtyChange={onProfileDirtyChange}
          onRegisterProfileSave={registerProfileSave}
          onRegisterIniSave={registerIniSave}
          onLogsFocusConsumed={props.onLogsFocusConsumed}
          onSendRcon={props.onSendRcon}
          onClearRconHistory={props.onClearRconHistory}
          onRconTabFocusChanged={props.onRconTabFocusChanged}
          onRefreshPlayers={props.onRefreshPlayers}
          onKickPlayer={props.onKickPlayer}
          onBanPlayer={props.onBanPlayer}
          onServerUpdated={props.onServerUpdated}
        />
      )}
    </section>
  );

  return (
    <div className={classes.root}>
      <WorkspaceHeader
        server={selectedServer}
        runtime={runtime}
        installation={installation}
        filesJobActive={filesJobActive || stopJobActive}
        filesJobReason={stopJobActive ? stopLockReason : filesLockReason}
        startBusy={props.startBusy === true}
        onStart={() => props.onStartServer(selectedServer.id)}
        onStop={() => props.onStopServer(selectedServer.id)}
        onRestart={() => props.onRestartServer(selectedServer.id)}
        onToggleEnabled={() =>
          props.onToggleServerEnabled?.(selectedServer.id, !selectedServer.enabled)
        }
        onOpenServerSwitcher={
          compactWorkspace ? () => setServerSwitcherOpen(true) : undefined
        }
        onOpenServerActions={
          compactWorkspace ? () => setServerActionsOpen(true) : undefined
        }
      />

      <div className={classes.body} data-compact={compactWorkspace || undefined}>
        {/* Keep main mounted across compact ↔ wide so Backups kind tabs survive resize (#271). */}
        <WorkspaceSplitBody
          compact={compactWorkspace}
          renderList={renderServerList}
          main={mainSection}
          side={sidePanel}
        />
      </div>

      {compactWorkspace && (
        <WorkspaceCompactDrawers
          serverSwitcherOpen={serverSwitcherOpen}
          serverActionsOpen={serverActionsOpen}
          onCloseServerSwitcher={() => setServerSwitcherOpen(false)}
          onCloseServerActions={() => setServerActionsOpen(false)}
          serverList={renderServerList()}
          sidePanel={sidePanel}
        />
      )}
    </div>
  );
}
