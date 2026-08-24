import type { ReactElement } from "react";
import { useMemo, useState } from "react";
import { ArrowRight } from "@phosphor-icons/react";
import { Button } from "@mantine/core";
import type {
  AppEvent,
  ServerInstallationInfo,
  ServerProfile,
  ServerRuntimeInfo,
  ServerStopProgress,
  SteamCmdStatus,
} from "@shared/types";
import type { useAppFleetRefresh } from "@app/hooks/useAppFleetRefresh";
import type { PlayerListState } from "@features/server-workspace/components/RconPanel/PlayerListSection";
import { useOverviewServerUpdates } from "@features/overview/hooks/useOverviewServerUpdates";
import { sumSurvivorsOnlineTotal } from "@features/overview/model/overviewFleetMetrics";
import {
  filterOverviewServers,
  partitionOverviewServers,
} from "@features/overview/model/overviewServerFilter";
import { OverviewHeader } from "./components/OverviewHeader";
import { RecentActivityPanel } from "./components/RecentActivityPanel";
import { ServerGrid, type SteamCmdCardJobRef } from "./components/ServerGrid";
import { UpdateAllOutdatedModal } from "./components/UpdateAllOutdatedModal/UpdateAllOutdatedModal";
import classes from "./OverviewPage.module.css";

type Refresh = ReturnType<typeof useAppFleetRefresh>["refresh"];

interface Props {
  loading?: boolean;
  onCreateServer: () => void;
  onImportServer: () => void;
  onCheckInstalls: () => void;
  checkingInstalls?: boolean;
  servers: ServerProfile[];
  statuses: Map<string, ServerRuntimeInfo>;
  installationInfo: Map<string, ServerInstallationInfo>;
  playerListsByServer: Map<string, PlayerListState>;
  officialSteamBuild: string | null;
  officialVersion?: string | null;
  events: AppEvent[];
  onViewAllActivity: () => void;
  steamCmdStatus: SteamCmdStatus | null;
  steamCmdBusy?: boolean;
  steamCmdPausedByServerId?: ReadonlyMap<string, SteamCmdCardJobRef>;
  steamCmdQueuedByServerId?: ReadonlyMap<string, SteamCmdCardJobRef>;
  stopProgressByServerId?: Map<string, ServerStopProgress>;
  startBusyByServerId?: ReadonlySet<string>;
  refresh: Refresh;
  onOpenDownloads: () => void;
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
  onCloneServer: (serverId: string) => void;
  onCopyConfiguration: (serverId: string) => void;
  onDeleteServer: (serverId: string) => void;
  onToggleServerEnabled?: (serverId: string, enabled: boolean) => void;
}

export function OverviewPage(props: Props): ReactElement {
  const [search, setSearch] = useState("");
  const { enabled, disabled } = useMemo(
    () => partitionOverviewServers(props.servers),
    [props.servers],
  );
  const filteredServers = useMemo(
    () => filterOverviewServers(enabled, search),
    [enabled, search],
  );
  const filteredDisabledServers = useMemo(
    () => filterOverviewServers(disabled, search),
    [disabled, search],
  );

  const survivorsOnlineTotal = useMemo(
    () =>
      sumSurvivorsOnlineTotal({
        enabledServers: enabled,
        statuses: props.statuses,
        playerListsByServer: props.playerListsByServer,
      }),
    [enabled, props.statuses, props.playerListsByServer],
  );

  const {
    checkingUpdates,
    checkForUpdates,
    canUpdateAllOutdated,
    updateAllOutdatedLoading,
    openUpdateAllOutdated,
    updateAllOutdatedOpen,
    updateAllOutdatedModalPlan,
    updateAllOutdatedQueueing,
    closeUpdateAllOutdated,
    confirmUpdateAllOutdated,
  } = useOverviewServerUpdates({
    servers: props.servers,
    installationInfo: props.installationInfo,
    statuses: props.statuses,
    officialSteamBuild: props.officialSteamBuild,
    steamCmdStatus: props.steamCmdStatus,
    refresh: props.refresh,
    onOpenDownloads: props.onOpenDownloads,
  });

  const steamCmdBusy = props.steamCmdBusy ?? false;
  const steamCmdStatus = props.steamCmdStatus;

  return (
    <div className={classes.page} data-overview-page>
      <OverviewHeader
        onCreateServer={props.onCreateServer}
        onImportServer={props.onImportServer}
        onCheckUpdates={() => void checkForUpdates()}
        onCheckInstalls={props.onCheckInstalls}
        onUpdateAllOutdated={() => void openUpdateAllOutdated()}
        canUpdateAllOutdated={canUpdateAllOutdated}
        openingUpdateAllOutdated={updateAllOutdatedLoading}
        checkingUpdates={checkingUpdates}
        checkingInstalls={props.checkingInstalls}
        survivorsOnlineTotal={survivorsOnlineTotal}
      />

      <UpdateAllOutdatedModal
        opened={updateAllOutdatedOpen}
        loading={updateAllOutdatedLoading}
        queueing={updateAllOutdatedQueueing}
        plan={updateAllOutdatedModalPlan}
        onClose={closeUpdateAllOutdated}
        onConfirm={() => void confirmUpdateAllOutdated()}
      />

      <div className={classes.content} data-overview-content>
        <ServerGrid
          search={search}
          onSearchChange={setSearch}
          loading={props.loading ?? false}
          onCreateServer={props.onCreateServer}
          onImportServer={props.onImportServer}
          servers={props.servers}
          filteredServers={filteredServers}
          disabledServers={filteredDisabledServers}
          statuses={props.statuses}
          installationInfo={props.installationInfo}
          playerListsByServer={props.playerListsByServer}
          officialSteamBuild={props.officialSteamBuild}
          officialVersion={props.officialVersion ?? null}
          steamCmdServerId={steamCmdStatus?.serverId ?? null}
          steamCmdRunning={steamCmdStatus?.running === true}
          steamCmdBusy={steamCmdBusy}
          steamCmdPausedByServerId={props.steamCmdPausedByServerId}
          steamCmdQueuedByServerId={props.steamCmdQueuedByServerId}
          steamCmdProgressPercent={steamCmdStatus?.progressPercent ?? null}
          steamCmdProgressLabel={steamCmdStatus?.progressLabel ?? null}
          steamCmdProgressBytesDownloaded={steamCmdStatus?.progressBytesDownloaded ?? null}
          steamCmdProgressBytesTotal={steamCmdStatus?.progressBytesTotal ?? null}
          steamCmdOperation={steamCmdStatus?.operation ?? null}
          stopProgressByServerId={props.stopProgressByServerId}
          startBusyByServerId={props.startBusyByServerId}
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
          onCheckUpdatesForServer={(id) => void checkForUpdates(id)}
          checkingUpdates={checkingUpdates}
          onCloneServer={props.onCloneServer}
          onCopyConfiguration={props.onCopyConfiguration}
          onDeleteServer={props.onDeleteServer}
          onToggleServerEnabled={props.onToggleServerEnabled}
          onOpenDownloads={props.onOpenDownloads}
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
