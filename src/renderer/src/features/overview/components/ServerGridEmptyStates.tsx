import type { ReactElement } from "react";
import { HardDrives, MagnifyingGlass, Plus } from "@phosphor-icons/react";
import { Button, Group, Skeleton, VisuallyHidden } from "@mantine/core";
import { EmptyState } from "@ui/EmptyState/EmptyState";
import type { OverviewFleetFilter } from "@features/overview/model/overviewFleetMetrics";
import classes from "../OverviewPage.module.css";

interface Props {
  loading: boolean;
  serverCount: number;
  fleetFilteredCount: number;
  showingDisabledServers: boolean;
  hasEnabledServers: boolean;
  fleetFilter: OverviewFleetFilter;
  onCreateServer: () => void;
  onImportServer: () => void;
  onClearFleetFilter: () => void;
  onClearSearch: () => void;
}

export function ServerGridEmptyStates(props: Props): ReactElement | null {
  if (props.loading) {
    return (
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
    );
  }

  if (props.serverCount === 0) {
    return (
      <EmptyState
        icon={<HardDrives size={24} weight="duotone" />}
        title="Create your first server"
        description="Add a profile on this PC, then install dedicated server files."
        titleOrder="h3"
        action={
          <Group gap="xs">
            <Button
              leftSection={<Plus size={16} />}
              onClick={props.onCreateServer}
              data-cta-prominence="primary"
            >
              New server
            </Button>
            <Button
              variant="default"
              onClick={props.onImportServer}
              data-cta-prominence="secondary"
            >
              Import existing install
            </Button>
          </Group>
        }
      />
    );
  }

  if (props.fleetFilteredCount === 0 && !props.showingDisabledServers) {
    return (
      <EmptyState
        icon={
          props.hasEnabledServers ? (
            <MagnifyingGlass size={20} />
          ) : (
            <HardDrives size={20} />
          )
        }
        title={
          props.hasEnabledServers
            ? props.fleetFilter !== "all"
              ? "No servers in this filter"
              : "No matches"
            : "No enabled servers"
        }
        description={
          props.hasEnabledServers
            ? props.fleetFilter !== "all"
              ? "Clear the metric filter or pick another tile."
              : "Try another name, map, or cluster."
            : "All server profiles are disabled. Turn on Show disabled to manage or re-enable them."
        }
        action={
          props.hasEnabledServers ? (
            <Button
              variant="default"
              size="xs"
              onClick={() => {
                if (props.fleetFilter !== "all") {
                  props.onClearFleetFilter();
                } else {
                  props.onClearSearch();
                }
              }}
            >
              {props.fleetFilter !== "all" ? "Clear filter" : "Clear search"}
            </Button>
          ) : undefined
        }
      />
    );
  }

  return null;
}
