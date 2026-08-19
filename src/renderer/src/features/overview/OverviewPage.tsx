import type { ReactElement } from "react";
import { ArrowRight } from "@phosphor-icons/react";
import { Button } from "@mantine/core";
import type {
  AppEvent,
  ServerInstallationInfo,
  ServerProfile,
  ServerRuntimeInfo,
  ServerStopProgress,
} from "@shared/types";
import { OverviewHeader } from "./components/OverviewHeader";
import { RecentActivityPanel } from "./components/RecentActivityPanel";
import { ServerGrid, type SteamCmdCardJobRef } from "./components/ServerGrid";
import { UpdateAllOutdatedModal } from "./components/UpdateAllOutdatedModal/UpdateAllOutdatedModal";
import type { UpdateAllOutdatedPlan } from "./updateAllOutdatedModel";
import classes from "./OverviewPage.module.css";

interface Props {
  search: string;
  onSearchChange: (value: string) => void;
  loading?: boolean;
  onCreateServer: () => void;
  onImportServer: () => void;
  onCheckUpdates: () => void;
  onCheckInstalls: () => void;
  onOpenUpdateAllOutdated?: () => void;
  onCloseUpdateAllOutdated?: () => void;
  onConfirmUpdateAllOutdated?: () => void;
  updateAllOutdatedOpen?: boolean;
  updateAllOutdatedPlan?: UpdateAllOutdatedPlan | null;
  updateAllOutdatedLoading?: boolean;
  updateAllOutdatedQueueing?: boolean;
  canUpdateAllOutdated?: boolean;
  openingUpdateAllOutdated?: boolean;
  checkingUpdates?: boolean;
  checkingInstalls?: boolean;
  servers: ServerProfile[];
  filteredServers: ServerProfile[];
  disabledServers?: ServerProfile[];
  runningServers: number;
  statuses: Map<string, ServerRuntimeInfo>;
  installationInfo: Map<string, ServerInstallationInfo>;
  officialSteamBuild: string | null;
  officialVersion?: string | null;
  events: AppEvent[];
  onViewAllActivity: () => void;
  steamCmdServerId?: string | null;
  steamCmdRunning?: boolean;
  steamCmdBusy?: boolean;
  steamCmdPausedByServerId?: ReadonlyMap<string, SteamCmdCardJobRef>;
  steamCmdQueuedByServerId?: ReadonlyMap<string, SteamCmdCardJobRef>;
  steamCmdProgressPercent?: number | null;
  steamCmdProgressLabel?: string | null;
  steamCmdProgressBytesDownloaded?: number | null;
  steamCmdProgressBytesTotal?: number | null;
  steamCmdOperation?: "install-steamcmd" | "install-files" | "update" | "sync-files" | "verify-files" | null;
  stopProgressByServerId?: Map<string, ServerStopProgress>;
  onOpenWorkspace: (server: ServerProfile) => void;
  onOpenLogs: (serverId: string) => void;
  onReviewError: (serverId: string) => void;
  onStartServer: (serverId: string) => void;
  onStopServer: (serverId: string) => void;
  onRestartServer: (serverId: string) => void;
  onKillServer: (serverId: string) => void;
  onOpenFolder: (serverId: string) => void;
  onInstallFiles: (serverId: string) => void;
  onUpdateNow: (serverId: string) => void;
  onVerifyFiles: (serverId: string) => void;
  onCheckUpdatesForServer: (serverId: string) => void;
  onCloneServer: (serverId: string) => void;
  onCopyConfiguration: (serverId: string) => void;
  onDeleteServer: (serverId: string) => void;
  onToggleServerEnabled?: (serverId: string, enabled: boolean) => void;
  onCancelSteamCmd: () => void;
  onResumeSteamCmd?: (serverId: string) => void;
  onCancelQueuedJob?: (serverId: string) => void;
}

export function OverviewPage(props: Props): ReactElement {
  return (
    <div className={classes.page} data-overview-page>
      <OverviewHeader
        onCreateServer={props.onCreateServer}
        onImportServer={props.onImportServer}
        onCheckUpdates={props.onCheckUpdates}
        onCheckInstalls={props.onCheckInstalls}
        onUpdateAllOutdated={props.onOpenUpdateAllOutdated}
        canUpdateAllOutdated={props.canUpdateAllOutdated}
        openingUpdateAllOutdated={props.openingUpdateAllOutdated}
        checkingUpdates={props.checkingUpdates}
        checkingInstalls={props.checkingInstalls}
      />

      <UpdateAllOutdatedModal
        opened={props.updateAllOutdatedOpen === true}
        loading={props.updateAllOutdatedLoading}
        queueing={props.updateAllOutdatedQueueing}
        plan={props.updateAllOutdatedPlan ?? null}
        onClose={() => props.onCloseUpdateAllOutdated?.()}
        onConfirm={() => props.onConfirmUpdateAllOutdated?.()}
      />

      <div className={classes.content} data-overview-content>
        <ServerGrid
          search={props.search}
          onSearchChange={props.onSearchChange}
          loading={props.loading ?? false}
          onCreateServer={props.onCreateServer}
          onImportServer={props.onImportServer}
          servers={props.servers}
          filteredServers={props.filteredServers}
          disabledServers={props.disabledServers ?? []}
          runningServers={props.runningServers}
          statuses={props.statuses}
          installationInfo={props.installationInfo}
          officialSteamBuild={props.officialSteamBuild}
          officialVersion={props.officialVersion ?? null}
          steamCmdServerId={props.steamCmdServerId ?? null}
          steamCmdRunning={props.steamCmdRunning ?? false}
          steamCmdBusy={props.steamCmdBusy ?? props.steamCmdRunning ?? false}
          steamCmdPausedByServerId={props.steamCmdPausedByServerId}
          steamCmdQueuedByServerId={props.steamCmdQueuedByServerId}
          steamCmdProgressPercent={props.steamCmdProgressPercent ?? null}
          steamCmdProgressLabel={props.steamCmdProgressLabel ?? null}
          steamCmdProgressBytesDownloaded={props.steamCmdProgressBytesDownloaded ?? null}
          steamCmdProgressBytesTotal={props.steamCmdProgressBytesTotal ?? null}
          steamCmdOperation={props.steamCmdOperation ?? null}
          stopProgressByServerId={props.stopProgressByServerId}
          onOpenWorkspace={props.onOpenWorkspace}
          onOpenLogs={props.onOpenLogs}
          onReviewError={props.onReviewError}
          onStartServer={props.onStartServer}
          onStopServer={props.onStopServer}
          onRestartServer={props.onRestartServer}
          onKillServer={props.onKillServer}
          onOpenFolder={props.onOpenFolder}
          onInstallFiles={props.onInstallFiles}
          onUpdateNow={props.onUpdateNow}
          onVerifyFiles={props.onVerifyFiles}
          onCheckUpdatesForServer={props.onCheckUpdatesForServer}
          checkingUpdates={props.checkingUpdates}
          onCloneServer={props.onCloneServer}
          onCopyConfiguration={props.onCopyConfiguration}
          onDeleteServer={props.onDeleteServer}
          onToggleServerEnabled={props.onToggleServerEnabled}
          onCancelSteamCmd={props.onCancelSteamCmd}
          onResumeSteamCmd={props.onResumeSteamCmd}
          onCancelQueuedJob={props.onCancelQueuedJob}
        />

        <div className={classes.narrowLogsLink}>
          <Button
            variant="subtle"
            size="compact-sm"
            rightSection={<ArrowRight size={14} />}
            onClick={props.onViewAllActivity}
          >
            View logs
          </Button>
        </div>

        <RecentActivityPanel
          events={props.events}
          loading={props.loading ?? false}
          onViewAll={props.onViewAllActivity}
        />
      </div>
    </div>
  );
}
