import { type ReactElement, useEffect, useMemo, useRef, useState } from "react";
import { Badge, Checkbox, Group, Stack, Text } from "@mantine/core";
import type { PlayerListState } from "@features/server-workspace/components/RconPanel/PlayerListSection";
import type { ServerInstallationInfo, ServerProfile, ServerRuntimeInfo, ServerStopProgress } from "@shared/types";
import type { ServerCardHandlers } from "@features/servers/components/ServerCard/serverCardHandlers";
import { ServerListControls } from "@features/servers/components/ServerListControls/ServerListControls";
import { useServerListPreferences } from "@features/servers/hooks/useServerListPreferences";
import { sortServers } from "@features/servers/serverListModel";
import { groupServersByCluster } from "@features/server-workspace/workspaceLayoutModel";
import {
  computeOverviewFleetStats,
  filterOverviewServersByFleet,
  type OverviewFleetFilter,
} from "@features/overview/model/overviewFleetMetrics";
import { SearchField } from "@ui/SearchField/SearchField";
import { OverviewFleetMetrics } from "./OverviewFleetMetrics/OverviewFleetMetrics";
import { OverviewServerCard } from "./OverviewServerCard";
import { ServerGridEmptyStates } from "./ServerGridEmptyStates";
import { ServerGridList } from "./ServerGridList";
import type { SteamCmdCardJobRef } from "./serverGridTypes";
import classes from "../OverviewPage.module.css";

export type { SteamCmdCardJobRef } from "./serverGridTypes";

interface Props {
  search: string;
  onSearchChange: (value: string) => void;
  loading: boolean;
  onCreateServer: () => void;
  onImportServer: () => void;
  servers: ServerProfile[];
  filteredServers: ServerProfile[];
  disabledServers: ServerProfile[];
  statuses: Map<string, ServerRuntimeInfo>;
  installationInfo: Map<string, ServerInstallationInfo>;
  playerListsByServer: Map<string, PlayerListState>;
  officialSteamBuild: string | null;
  officialVersion?: string | null;
  steamCmdServerId: string | null;
  steamCmdRunning: boolean;
  steamCmdBusy?: boolean;
  steamCmdPausedByServerId?: ReadonlyMap<string, SteamCmdCardJobRef>;
  steamCmdQueuedByServerId?: ReadonlyMap<string, SteamCmdCardJobRef>;
  steamCmdProgressPercent?: number | null;
  steamCmdProgressLabel?: string | null;
  steamCmdProgressBytesDownloaded?: number | null;
  steamCmdProgressBytesTotal?: number | null;
  steamCmdOperation?: "install-steamcmd" | "install-files" | "update" | "sync-files" | "verify-files" | null;
  stopProgressByServerId?: Map<string, ServerStopProgress>;
  startBusyByServerId?: ReadonlySet<string>;
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
  checkingUpdates?: boolean;
  onCloneServer: (serverId: string) => void;
  onCopyConfiguration: (serverId: string) => void;
  onDeleteServer: (serverId: string) => void;
  onToggleServerEnabled?: (serverId: string, enabled: boolean) => void;
  onOpenDownloads?: (serverId: string) => void;
}

export function ServerGrid(props: Props): ReactElement {
  const [showDisabled, setShowDisabled] = useState(false);
  const [fleetFilter, setFleetFilter] = useState<OverviewFleetFilter>("all");
  const { sort, setSort, view, setView } = useServerListPreferences("overview");
  const propsRef = useRef(props);
  useEffect(() => {
    propsRef.current = props;
  });

  /** Stable across Overview polls so memoized ServerCard can skip unrelated rows (#209). */
  const cardHandlers = useMemo<ServerCardHandlers>(
    () => ({
      onStartServer: (serverId) => propsRef.current.onStartServer(serverId),
      onStopServer: (serverId) => propsRef.current.onStopServer(serverId),
      onKillServer: (serverId) => propsRef.current.onKillServer(serverId),
      onRestartServer: (serverId) => propsRef.current.onRestartServer(serverId),
      onOpenWorkspace: (server) => propsRef.current.onOpenWorkspace(server),
      onOpenLogs: (serverId) => propsRef.current.onOpenLogs(serverId),
      onReviewError: (serverId) => propsRef.current.onReviewError(serverId),
      onOpenFolder: (serverId) => propsRef.current.onOpenFolder(serverId),
      onInstallFiles: (serverId) => propsRef.current.onInstallFiles(serverId),
      onUpdateNow: (serverId) => propsRef.current.onUpdateNow(serverId),
      onVerifyFiles: (serverId) => propsRef.current.onVerifyFiles(serverId),
      onCheckUpdatesForServer: (serverId) =>
        propsRef.current.onCheckUpdatesForServer(serverId),
      onCloneServer: (serverId) => propsRef.current.onCloneServer(serverId),
      onCopyConfiguration: (serverId) =>
        propsRef.current.onCopyConfiguration(serverId),
      onDeleteServer: (serverId) => propsRef.current.onDeleteServer(serverId),
      onOpenDownloads: (serverId) => propsRef.current.onOpenDownloads?.(serverId),
      onToggleServerEnabled: (serverId, enabled) =>
        propsRef.current.onToggleServerEnabled?.(serverId, enabled),
    }),
    [],
  );

  const enabledServers = useMemo(
    () => props.servers.filter((server) => server.enabled),
    [props.servers],
  );
  const enabledServerCount = enabledServers.length;
  const hasEnabledServers = enabledServerCount > 0;
  const showingDisabledServers =
    showDisabled && props.disabledServers.length > 0;
  const showFleetMetrics = !props.loading && props.servers.length > 0;

  const fleetComputed = useMemo(
    () =>
      computeOverviewFleetStats({
        enabledServers,
        statuses: props.statuses,
        installationInfo: props.installationInfo,
        officialSteamBuild: props.officialSteamBuild,
        playerListsByServer: props.playerListsByServer,
      }),
    [
      enabledServers,
      props.statuses,
      props.installationInfo,
      props.officialSteamBuild,
      props.playerListsByServer,
    ],
  );
  const fleetStats = fleetComputed.stats;
  const fleetAttentionIssues = fleetComputed.attentionIssues;

  const fleetFilteredServers = useMemo(
    () =>
      filterOverviewServersByFleet(
        props.filteredServers,
        fleetFilter,
        fleetStats,
        props.statuses,
      ),
    [props.filteredServers, fleetFilter, fleetStats, props.statuses],
  );

  const enabledLabel =
    enabledServerCount === 1
      ? "1 enabled server"
      : `${enabledServerCount} enabled servers`;
  const disabledLabel =
    props.disabledServers.length === 1
      ? "1 disabled server"
      : `${props.disabledServers.length} disabled servers`;
  const filteredLabel =
    fleetFilteredServers.length !== enabledServerCount
      ? ` · ${fleetFilteredServers.length} ${
          fleetFilteredServers.length === 1 ? "result" : "results"
        }`
      : "";

  const sortedEnabled = useMemo(
    () => sortServers(fleetFilteredServers, sort),
    [fleetFilteredServers, sort],
  );
  const sortedDisabled = useMemo(
    () => sortServers(props.disabledServers, sort),
    [props.disabledServers, sort],
  );
  const enabledGroups = useMemo(
    () => groupServersByCluster(sortedEnabled),
    [sortedEnabled],
  );

  const renderServerCard = (server: ServerProfile): ReactElement => (
    <OverviewServerCard
      key={server.id}
      server={server}
      statuses={props.statuses}
      installationInfo={props.installationInfo}
      playerList={props.playerListsByServer.get(server.id) ?? null}
      officialSteamBuild={props.officialSteamBuild}
      officialVersion={props.officialVersion ?? null}
      steamCmdServerId={props.steamCmdServerId}
      steamCmdRunning={props.steamCmdRunning ?? false}
      steamCmdBusy={props.steamCmdBusy ?? props.steamCmdRunning}
      steamCmdPausedByServerId={props.steamCmdPausedByServerId}
      steamCmdQueuedByServerId={props.steamCmdQueuedByServerId}
      steamCmdProgressPercent={props.steamCmdProgressPercent}
      steamCmdProgressLabel={props.steamCmdProgressLabel}
      steamCmdProgressBytesDownloaded={props.steamCmdProgressBytesDownloaded}
      steamCmdProgressBytesTotal={props.steamCmdProgressBytesTotal}
      steamCmdOperation={props.steamCmdOperation}
      stopProgressByServerId={props.stopProgressByServerId}
      startBusyByServerId={props.startBusyByServerId}
      checkingUpdates={props.checkingUpdates}
      handlers={cardHandlers}
    />
  );

  return (
    <section
      className={classes.serverSection}
      aria-label="Server list"
      data-server-list
    >
      {showFleetMetrics ? (
        <div className={classes.fleetMetrics}>
          <OverviewFleetMetrics
            stats={fleetStats}
            attentionIssues={fleetAttentionIssues}
            fleetFilter={fleetFilter}
            onFleetFilter={setFleetFilter}
          />
        </div>
      ) : null}

      <div className={classes.serverSectionHeader}>
        <Group gap="sm" align="center" wrap="wrap" className={classes.serverSummaryRow}>
          <Text c="dimmed" size="sm" data-server-summary>
            {enabledLabel}
            {filteredLabel}
          </Text>
          {props.disabledServers.length > 0 && (
            <>
              <Badge size="sm" color="gray" variant="light" data-disabled-count={props.disabledServers.length}>
                {disabledLabel}
              </Badge>
              <Checkbox
                size="xs"
                label="Show disabled"
                checked={showDisabled}
                onChange={(event) => setShowDisabled(event.currentTarget.checked)}
              />
            </>
          )}
        </Group>

        {!props.loading && props.servers.length > 0 && (
          <div className={classes.serverToolbar}>
            <ServerListControls
              sort={sort}
              onSortChange={setSort}
              view={view}
              onViewChange={setView}
            />
            <div className={classes.serverSearch}>
              <SearchField
                value={props.search}
                onChange={props.onSearchChange}
                label="Search servers"
                placeholder="Search by name, map, or cluster"
              />
            </div>
          </div>
        )}
      </div>

      <Stack gap="md">
        <ServerGridEmptyStates
          loading={props.loading}
          serverCount={props.servers.length}
          fleetFilteredCount={fleetFilteredServers.length}
          showingDisabledServers={showingDisabledServers}
          hasEnabledServers={hasEnabledServers}
          fleetFilter={fleetFilter}
          onCreateServer={props.onCreateServer}
          onImportServer={props.onImportServer}
          onClearFleetFilter={() => setFleetFilter("all")}
          onClearSearch={() => props.onSearchChange("")}
        />

        {!props.loading &&
          (fleetFilteredServers.length > 0 ||
            (showDisabled && props.disabledServers.length > 0)) && (
          <ServerGridList
            view={view}
            enabledGroups={enabledGroups}
            sortedEnabled={sortedEnabled}
            sortedDisabled={sortedDisabled}
            showDisabled={showDisabled}
            renderServerCard={renderServerCard}
          />
        )}
      </Stack>
    </section>
  );
}
