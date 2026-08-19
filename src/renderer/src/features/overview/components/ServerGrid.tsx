import { type ReactElement, useEffect, useMemo, useRef, useState } from "react";
import { HardDrives, MagnifyingGlass, Plus } from "@phosphor-icons/react";
import { Badge, Button, Checkbox, Group, Skeleton, Stack, Text, VisuallyHidden } from "@mantine/core";
import type { ServerInstallationInfo, ServerProfile, ServerRuntimeInfo, ServerStopProgress } from "@shared/types";
import type { ServerCardHandlers } from "@features/servers/components/ServerCard/serverCardHandlers";
import { ServerListControls } from "@features/servers/components/ServerListControls/ServerListControls";
import { useServerListPreferences } from "@features/servers/hooks/useServerListPreferences";
import { sortServers } from "@features/servers/serverListModel";
import { groupServersByCluster } from "@features/server-workspace/workspaceLayoutModel";
import { EmptyState } from "@ui/EmptyState/EmptyState";
import { SearchField } from "@ui/SearchField/SearchField";
import {
  AttentionIssuesPopover,
  collectAttentionIssues,
} from "./AttentionIssuesPopover/AttentionIssuesPopover";
import { OverviewServerCard } from "./OverviewServerCard";
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
  runningServers: number;
  statuses: Map<string, ServerRuntimeInfo>;
  installationInfo: Map<string, ServerInstallationInfo>;
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
  onCancelSteamCmd: () => void;
  onResumeSteamCmd?: (serverId: string) => void;
  onCancelQueuedJob?: (serverId: string) => void;
}

export function ServerGrid(props: Props): ReactElement {
  const [showDisabled, setShowDisabled] = useState(false);
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
      onCancelSteamCmd: () => propsRef.current.onCancelSteamCmd(),
      onResumeSteamCmd: (serverId) => propsRef.current.onResumeSteamCmd?.(serverId),
      onCancelQueuedJob: (serverId) => propsRef.current.onCancelQueuedJob?.(serverId),
      onToggleServerEnabled: (serverId, enabled) =>
        propsRef.current.onToggleServerEnabled?.(serverId, enabled),
    }),
    [],
  );

  const enabledServerCount = props.servers.filter(
    (server) => server.enabled,
  ).length;
  const hasEnabledServers = enabledServerCount > 0;
  const showingDisabledServers =
    showDisabled && props.disabledServers.length > 0;

  const enabledLabel =
    enabledServerCount === 1
      ? "1 enabled server"
      : `${enabledServerCount} enabled servers`;
  const disabledLabel =
    props.disabledServers.length === 1
      ? "1 disabled server"
      : `${props.disabledServers.length} disabled servers`;
  const runningLabel =
    props.runningServers === 0
      ? "none running"
      : props.runningServers === 1
        ? "1 running"
        : `${props.runningServers} running`;
  const filteredLabel =
    props.filteredServers.length !== enabledServerCount
      ? ` · ${props.filteredServers.length} ${
          props.filteredServers.length === 1 ? "result" : "results"
        }`
      : "";

  const attentionIssues = useMemo(
    () =>
      collectAttentionIssues({
        servers: showDisabled
          ? [...props.filteredServers, ...props.disabledServers]
          : props.filteredServers,
        statuses: props.statuses,
        installationInfo: props.installationInfo,
        officialSteamBuild: props.officialSteamBuild,
      }),
    [
      showDisabled,
      props.filteredServers,
      props.disabledServers,
      props.statuses,
      props.installationInfo,
      props.officialSteamBuild,
    ],
  );

  const sortedEnabled = useMemo(
    () => sortServers(props.filteredServers, sort),
    [props.filteredServers, sort],
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
      officialSteamBuild={props.officialSteamBuild}
      officialVersion={props.officialVersion ?? null}
      steamCmdServerId={props.steamCmdServerId}
      steamCmdBusy={props.steamCmdBusy ?? props.steamCmdRunning}
      steamCmdPausedByServerId={props.steamCmdPausedByServerId}
      steamCmdQueuedByServerId={props.steamCmdQueuedByServerId}
      steamCmdProgressPercent={props.steamCmdProgressPercent}
      steamCmdProgressLabel={props.steamCmdProgressLabel}
      steamCmdProgressBytesDownloaded={props.steamCmdProgressBytesDownloaded}
      steamCmdProgressBytesTotal={props.steamCmdProgressBytesTotal}
      steamCmdOperation={props.steamCmdOperation}
      stopProgressByServerId={props.stopProgressByServerId}
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
      <div className={classes.serverSectionHeader}>
        <Group gap="sm" align="center" wrap="wrap" className={classes.serverSummaryRow}>
          <Text c="dimmed" size="sm" data-server-summary>
            {enabledLabel} · {runningLabel}
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
          <AttentionIssuesPopover issues={attentionIssues} />
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
        {props.loading && (
          <div
            className={classes.serverSkeletons}
            role="status"
            aria-live="polite"
            data-server-skeletons
          >
            <VisuallyHidden>Loading servers</VisuallyHidden>
            {[0, 1].map((item) => (
              <div className={classes.serverSkeleton} key={item} aria-hidden="true">
                <Skeleton circle width={52} height={52} />
                <div className={classes.serverSkeletonIdentity}>
                  <Skeleton width="42%" height={14} radius="xl" />
                  <Skeleton width="68%" height={10} radius="xl" />
                </div>
                <div className={classes.serverSkeletonMeta}>
                  <Skeleton width={68} height={10} radius="xl" />
                  <Skeleton width={84} height={10} radius="xl" />
                  <Skeleton width={58} height={10} radius="xl" />
                </div>
                <Skeleton width={92} height={30} radius="md" />
              </div>
            ))}
          </div>
        )}

        {!props.loading && props.servers.length === 0 && (
          <EmptyState
            icon={<HardDrives size={24} weight="duotone" />}
            title="Create your first server"
            description="Add a profile on this PC, then install dedicated server files."
            titleOrder="h3"
            action={
              <Group gap="xs">
                <Button leftSection={<Plus size={16} />} onClick={props.onCreateServer}>
                  New server
                </Button>
                <Button variant="default" onClick={props.onImportServer}>
                  Import existing install
                </Button>
              </Group>
            }
          />
        )}

        {!props.loading &&
          props.servers.length > 0 &&
          props.filteredServers.length === 0 &&
          !showingDisabledServers && (
            <EmptyState
              icon={
                hasEnabledServers ? (
                  <MagnifyingGlass size={20} />
                ) : (
                  <HardDrives size={20} />
                )
              }
              title={hasEnabledServers ? "No matches" : "No enabled servers"}
              description={
                hasEnabledServers
                  ? "Try another name, map, or cluster."
                  : "All server profiles are disabled. Turn on Show disabled to manage or re-enable them."
              }
              action={
                hasEnabledServers ? (
                  <Button
                    variant="default"
                    size="xs"
                    onClick={() => props.onSearchChange("")}
                  >
                    Clear search
                  </Button>
                ) : undefined
              }
            />
          )}

        {!props.loading &&
          (props.filteredServers.length > 0 ||
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
