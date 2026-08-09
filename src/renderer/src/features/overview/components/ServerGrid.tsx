import { type ReactElement, useMemo, useState } from "react";
import { HardDrives, MagnifyingGlass, Plus } from "@phosphor-icons/react";
import { Badge, Button, Checkbox, Group, Skeleton, Stack, Text, VisuallyHidden } from "@mantine/core";
import type { ServerInstallationInfo, ServerProfile, ServerRuntimeInfo, ServerStopProgress } from "@shared/types";
import { ServerCard } from "@features/servers/components/ServerCard/ServerCard";
import { EmptyState } from "@ui/EmptyState/EmptyState";
import { SearchField } from "@ui/SearchField/SearchField";
import {
  AttentionIssuesPopover,
  collectAttentionIssues,
} from "./AttentionIssuesPopover/AttentionIssuesPopover";
import classes from "../OverviewPage.module.css";

interface Props {
  search: string;
  onSearchChange: (value: string) => void;
  loading: boolean;
  onCreateServer: () => void;
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
}

export function ServerGrid(props: Props): ReactElement {
  const [showDisabled, setShowDisabled] = useState(false);
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

  const renderServerCard = (server: ServerProfile): ReactElement => {
    const stopProgress = props.stopProgressByServerId?.get(server.id);
    const stopBusy = stopProgress?.active === true;
    return (
      <ServerCard
        key={server.id}
        server={server}
        runtime={props.statuses.get(server.id) ?? null}
        installation={props.installationInfo.get(server.id) ?? null}
        officialSteamBuild={props.officialSteamBuild}
        officialVersion={props.officialVersion ?? null}
        steamCmdBusy={
          !stopBusy && (props.steamCmdBusy ?? props.steamCmdRunning) && props.steamCmdServerId === server.id
        }
        steamCmdProgressPercent={
          props.steamCmdServerId === server.id ? (props.steamCmdProgressPercent ?? null) : null
        }
        steamCmdProgressLabel={
          props.steamCmdServerId === server.id ? (props.steamCmdProgressLabel ?? null) : null
        }
        steamCmdProgressBytesDownloaded={
          props.steamCmdServerId === server.id
            ? (props.steamCmdProgressBytesDownloaded ?? null)
            : null
        }
        steamCmdProgressBytesTotal={
          props.steamCmdServerId === server.id ? (props.steamCmdProgressBytesTotal ?? null) : null
        }
        steamCmdOperation={
          props.steamCmdServerId === server.id ? (props.steamCmdOperation ?? null) : null
        }
        stopBusy={stopBusy}
        stopProgressPercent={stopBusy ? (stopProgress?.percent ?? null) : null}
        stopProgressLabel={stopBusy ? (stopProgress?.label ?? null) : null}
        checkingUpdates={props.checkingUpdates}
        onStart={() => props.onStartServer(server.id)}
        onStop={() => props.onStopServer(server.id)}
        onKill={() => props.onKillServer(server.id)}
        onRestart={() => props.onRestartServer(server.id)}
        onOpenWorkspace={() => props.onOpenWorkspace(server)}
        onOpenLogs={() => props.onOpenLogs(server.id)}
        onReviewError={() => props.onReviewError(server.id)}
        onOpenFolder={() => props.onOpenFolder(server.id)}
        onInstallFiles={() => props.onInstallFiles(server.id)}
        onUpdateNow={() => props.onUpdateNow(server.id)}
        onVerifyFiles={() => props.onVerifyFiles(server.id)}
        onCheckUpdates={() => props.onCheckUpdatesForServer(server.id)}
        onClone={() => props.onCloneServer(server.id)}
        onCopyConfiguration={() => props.onCopyConfiguration(server.id)}
        onDelete={() => props.onDeleteServer(server.id)}
        onToggleEnabled={() => props.onToggleServerEnabled?.(server.id, !server.enabled)}
        onCancelSteamCmd={props.onCancelSteamCmd}
      />
    );
  };

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
          <div className={classes.serverSearch}>
            <SearchField
              value={props.search}
              onChange={props.onSearchChange}
              label="Search servers"
              placeholder="Search by name, map, or cluster"
            />
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
                <Skeleton circle width={44} height={44} />
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
            description="Set up a world to play with friends or manage your community."
            titleOrder="h3"
            action={
              <Button leftSection={<Plus size={16} />} onClick={props.onCreateServer}>
                New server
              </Button>
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
          <div className={classes.serverGrid}>
            {props.filteredServers.map(renderServerCard)}
            {showDisabled && props.disabledServers.map(renderServerCard)}
          </div>
        )}
      </Stack>
    </section>
  );
}
