import type { ReactElement } from "react";
import { HardDrives, MagnifyingGlass, Plus } from "@phosphor-icons/react";
import { Badge, Button, Group, Skeleton, Stack, Text, Title, VisuallyHidden } from "@mantine/core";
import type { ServerInstallationInfo, ServerProfile, ServerRuntimeInfo, ServerStopProgress } from "@shared/types";
import { getServerUpdateState } from "@shared/server-update-status";
import { useMemo, useState } from "react";
import { EmptyState } from "@ui/EmptyState/EmptyState";
import { SearchField } from "@ui/SearchField/SearchField";
import { ServerGridCards } from "./ServerGridCards";
import classes from "../OverviewPage.module.css";

interface Props {
  search: string;
  onSearchChange: (value: string) => void;
  loading: boolean;
  onCreateServer: () => void;
  servers: ServerProfile[];
  filteredServers: ServerProfile[];
  runningServers: number;
  statuses: Map<string, ServerRuntimeInfo>;
  installationInfo: Map<string, ServerInstallationInfo>;
  officialSteamBuild: string | null;
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
  onSetServerEnabled?: (serverId: string, enabled: boolean) => void;
  onOpenFolder: (serverId: string) => void;
  onInstallFiles: (serverId: string) => void;
  onUpdateNow: (serverId: string) => void;
  onVerifyFiles: (serverId: string) => void;
  onCheckUpdatesForServer: (serverId: string) => void;
  checkingUpdates?: boolean;
  onCloneServer: (serverId: string) => void;
  onDeleteServer: (serverId: string) => void;
  onCancelSteamCmd: () => void;
}

export function ServerGrid(props: Props): ReactElement {
  const [showInactive, setShowInactive] = useState(false);
  const enabledTotal = props.servers.filter((server) => server.enabled !== false).length;
  const inactiveTotal = props.servers.length - enabledTotal;
  const enabledServers = useMemo(
    () => props.filteredServers.filter((server) => server.enabled !== false),
    [props.filteredServers],
  );
  const inactiveServers = useMemo(
    () => props.filteredServers.filter((server) => server.enabled === false),
    [props.filteredServers],
  );
  const totalLabel =
    props.servers.length === 1
      ? "1 profile saved"
      : `${props.servers.length} profiles saved`;
  const enabledLabel =
    enabledTotal === 0
      ? "no active profiles"
      : enabledTotal === 1
        ? "1 active profile"
        : `${enabledTotal} active profiles`;
  const runningLabel =
    props.runningServers === 0
      ? "none running"
      : props.runningServers === 1
        ? "1 running"
        : `${props.runningServers} running`;
  const filteredLabel =
    props.filteredServers.length !== props.servers.length
      ? ` · ${props.filteredServers.length} ${
          props.filteredServers.length === 1 ? "result" : "results"
        }`
      : "";
  const inactiveLabel =
    inactiveTotal === 0
      ? ""
      : inactiveTotal === 1
        ? " · 1 inactive"
        : ` · ${inactiveTotal} inactive`;

  const attentionCount = enabledServers.reduce((count, server) => {
    const status = props.statuses.get(server.id)?.status ?? "stopped";
    const installation = props.installationInfo.get(server.id) ?? null;
    if (status === "error") return count + 1;
    if (installation?.installed !== true) return count + 1;
    if (getServerUpdateState(installation, props.officialSteamBuild) === "available") {
      return count + 1;
    }
    return count;
  }, 0);

  const attentionLabel =
    attentionCount === 0
      ? null
      : attentionCount === 1
        ? "1 needs attention"
        : `${attentionCount} need attention`;

  return (
    <section
      className={classes.serverSection}
      aria-labelledby="server-list-title"
      data-server-list
    >
      <div className={classes.serverSectionHeader}>
        <div>
          <Title order={2} id="server-list-title" className={classes.serverSectionTitle}>
            Your servers
          </Title>
          <Group gap="sm" align="center" wrap="wrap" className={classes.serverSummaryRow}>
            <Text c="dimmed" size="sm" data-server-summary>
            {totalLabel} · {enabledLabel}{inactiveLabel} · {runningLabel}
              {filteredLabel}
            </Text>
            {attentionLabel !== null && (
              <Badge
                size="sm"
                color="attention"
                variant="light"
                data-attention-count={attentionCount}
              >
                {attentionLabel}
              </Badge>
            )}
          </Group>
        </div>

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
          props.filteredServers.length === 0 && (
            <EmptyState
              icon={<MagnifyingGlass size={20} />}
              title="No matches"
              description="Try another name, map, or cluster."
              action={
                <Button variant="default" size="xs" onClick={() => props.onSearchChange("")}>
                  Clear search
                </Button>
              }
            />
          )}

        {!props.loading && enabledServers.length === 0 && props.servers.length > 0 && (
          <EmptyState
            icon={<HardDrives size={20} weight="duotone" />}
            title="No active profiles"
            description="Enable an inactive profile to bring it back to the default fleet."
            action={
              inactiveServers.length > 0 ? (
                <Button variant="default" size="xs" onClick={() => setShowInactive(true)}>
                  Show inactive profiles
                </Button>
              ) : undefined
            }
          />
        )}

        {!props.loading && enabledServers.length > 0 && (
          <div className={classes.serverGrid}>
            <ServerGridCards {...props} servers={enabledServers} />
          </div>
        )}

        {!props.loading && inactiveServers.length > 0 && (
          <Stack gap="sm">
            <Group justify="space-between" align="center" wrap="wrap">
              <div>
                <Title order={3}>Inactive profiles</Title>
                <Text c="dimmed" size="sm">
                  Offline maintenance stays available, but these profiles cannot spawn until enabled again.
                </Text>
              </div>
              <Button
                variant="default"
                size="xs"
                onClick={() => setShowInactive((current) => !current)}
              >
                {showInactive ? "Hide inactive" : `Show inactive (${inactiveServers.length})`}
              </Button>
            </Group>
            {showInactive && (
              <div className={classes.serverGrid}>
                <ServerGridCards {...props} servers={inactiveServers} />
              </div>
            )}
          </Stack>
        )}
      </Stack>
    </section>
  );
}
