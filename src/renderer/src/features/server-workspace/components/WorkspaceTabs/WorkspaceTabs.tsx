import { Tabs } from "@mantine/core";
import type { AppEvent, ServerInstallationInfo, ServerProfile, ServerRuntimeInfo } from "@shared/types";
import { ServerBackupPanel } from "@features/backups/ServerBackupPanel";
import { ServerLogsPanel, type ServerLogsFocus } from "@features/logs/ServerLogsPanel";
import { ServerForm } from "@features/servers/components/ServerForm/ServerForm";
import { MoveInstallDialog } from "@features/servers/components/MoveInstallDialog/MoveInstallDialog";
import { useState, type ReactElement } from "react";
import type {
  RconHistoryEntry,
  WorkspaceTab,
} from "../../serverWorkspaceTypes";
import { ConfigurationEditor } from "../ConfigurationEditor/ConfigurationEditor";
import { RconPanel } from "../RconPanel/RconPanel";
import type { PlayerListState } from "../RconPanel/PlayerListSection";
import { ServerModsPanel } from "../ServerModsPanel/ServerModsPanel";
import { ServerLaunchPanel } from "../ServerLaunchPanel/ServerLaunchPanel";
import { WorkspacePanelErrorBoundary } from "@ui/WorkspacePanelErrorBoundary/WorkspacePanelErrorBoundary";
import classes from "../../ServerWorkspacePage.module.css";

interface Props {
  value: WorkspaceTab;
  server: ServerProfile;
  /** Fleet profiles — port-conflict preview on edit and Move dest nesting (#294). */
  servers: ServerProfile[];
  runtime: ServerRuntimeInfo | null;
  installation: ServerInstallationInfo | null;
  events: AppEvent[];
  rconHistory: RconHistoryEntry[];
  playerList: PlayerListState;
  opsLocked: boolean;
  filesJobActive: boolean;
  stopJobActive: boolean;
  filesLockReason: string;
  stopLockReason: string;
  iniDirty: boolean;
  iniEditorVersion: number;
  logsFocus?: ServerLogsFocus | null;
  onChange: (tab: WorkspaceTab) => void;
  onBack: () => void;
  onOpenAssistant: () => void;
  onIniDirtyChange: (dirty: boolean) => void;
  /** Embedded ServerForm leave guard — composed on the workspace page, not App. */
  onRegisterProfileLeaveGuard?: (guard: ((action: () => void) => void) | null) => void;
  onProfileDirtyChange?: (dirty: boolean) => void;
  onRegisterProfileSave?: (save: (() => Promise<boolean>) | null) => void;
  onRegisterIniSave?: (save: (() => Promise<boolean>) | null) => void;
  onLogsFocusConsumed?: () => void;
  onSendRcon: (serverId: string, command: string) => Promise<boolean>;
  onClearRconHistory: (serverId: string) => void;
  onRconTabFocusChanged: (serverId: string, isFocused: boolean) => Promise<void>;
  onRefreshPlayers: (serverId: string) => Promise<void>;
  onKickPlayer: (serverId: string, playerKey: string) => Promise<boolean>;
  onBanPlayer: (serverId: string, playerKey: string) => Promise<boolean>;
  onServerUpdated: () => void;
}

export function WorkspaceTabs(props: Props): ReactElement {
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  /** Snapshot at open so refresh remounts do not rewrite the dialog mid-move. */
  const [moveServer, setMoveServer] = useState<ServerProfile | null>(null);
  const [rconPlayersFocus, setRconPlayersFocus] = useState<
    "survivors" | "admins" | null
  >(null);

  return (
    <>
      <Tabs
        value={props.value}
        onChange={(value) => {
          if (value !== null) props.onChange(value as WorkspaceTab);
        }}
        className={classes.tabs}
      >
        <Tabs.List className={classes.tabList} aria-label="Workspace tabs">
          <Tabs.Tab value="server">Server</Tabs.Tab>
          <Tabs.Tab value="iniFiles">INI Files</Tabs.Tab>
          <Tabs.Tab value="mods">Mods</Tabs.Tab>
          <Tabs.Tab value="launch">Launch</Tabs.Tab>
          <Tabs.Tab value="backups">Backups</Tabs.Tab>
          <Tabs.Tab value="logs">Logs</Tabs.Tab>
          <Tabs.Tab value="rcon">RCON</Tabs.Tab>
        </Tabs.List>

        <div className={classes.tabPanel}>
          <WorkspacePanelErrorBoundary
            resetKey={`${props.value}:${props.server.id}:${props.server.installDir}`}
          >
            {props.value === "server" && (
              <ServerForm
                // Remount when install path changes (Move) without remounting on every
                // mods/metadata refresh (updatedAt), which closed the Map select mid-pick.
                key={`${props.server.id}:${props.server.installDir}`}
                initial={props.server}
                servers={props.servers}
                variant="embedded"
                serverActive={props.opsLocked}
                filesJobActive={props.filesJobActive}
                onCancel={props.onBack}
                onSaved={props.onServerUpdated}
                onRegisterLeaveGuard={props.onRegisterProfileLeaveGuard}
                onDirtyChange={props.onProfileDirtyChange}
                onRegisterSave={props.onRegisterProfileSave}
                onOpenMoveInstall={() => {
                  setMoveServer(props.server);
                  setMoveDialogOpen(true);
                }}
                onOpenConfigurationAssistant={props.onOpenAssistant}
                configurationAssistantDisabled={props.iniDirty}
              />
            )}

            {props.value === "mods" && (
              <ServerModsPanel
                key={props.server.id}
                server={props.server}
                onServerUpdated={props.onServerUpdated}
              />
            )}

            {props.value === "launch" && (
              <ServerLaunchPanel
                key={props.server.id}
                server={props.server}
                onServerUpdated={props.onServerUpdated}
              />
            )}

            {props.value === "iniFiles" && (
              <div className={classes.configHost}>
                <ConfigurationEditor
                  key={`${props.server.id}:${props.iniEditorVersion}`}
                  server={props.server}
                  section="iniFiles"
                  serverActive={props.opsLocked}
                  filesJobActive={props.filesJobActive}
                  onDirtyChange={props.onIniDirtyChange}
                  onRegisterSave={props.onRegisterIniSave}
                  onOpenAdminList={() => {
                    setRconPlayersFocus("admins");
                    props.onChange("rcon");
                  }}
                />
              </div>
            )}

            {props.value === "backups" && (
              <ServerBackupPanel
                server={props.server}
                runtime={props.runtime}
                installation={props.installation}
                embedded
                opsLocked={props.opsLocked}
                opsLockReason={
                  props.stopJobActive
                    ? props.stopLockReason
                    : props.filesJobActive
                      ? props.filesLockReason
                      : undefined
                }
                createLocked={props.stopJobActive}
                createLockReason={props.stopLockReason}
              />
            )}

            {props.value === "logs" && (
              <ServerLogsPanel
                server={props.server}
                embedded
                focus={props.logsFocus}
                onFocusConsumed={props.onLogsFocusConsumed}
                onOpenBackupsTab={() => props.onChange("backups")}
              />
            )}

            {props.value === "rcon" && (
              <RconPanel
                server={props.server}
                runtime={props.runtime}
                events={props.events}
                rconHistory={props.rconHistory}
                playerList={props.playerList}
                iniDirty={props.iniDirty}
                playersPanelFocus={rconPlayersFocus}
                onPlayersPanelFocusConsumed={() => setRconPlayersFocus(null)}
                onSendRcon={props.onSendRcon}
                onClearRconHistory={props.onClearRconHistory}
                onRconTabFocusChanged={props.onRconTabFocusChanged}
                onRefreshPlayers={props.onRefreshPlayers}
                onKickPlayer={props.onKickPlayer}
                onBanPlayer={props.onBanPlayer}
              />
            )}
          </WorkspacePanelErrorBoundary>
        </div>
      </Tabs>

      <MoveInstallDialog
        opened={moveDialogOpen}
        server={moveServer}
        servers={props.servers}
        onClose={() => {
          setMoveDialogOpen(false);
          setMoveServer(null);
        }}
        onMoved={() => {
          props.onServerUpdated();
        }}
      />
    </>
  );
}
