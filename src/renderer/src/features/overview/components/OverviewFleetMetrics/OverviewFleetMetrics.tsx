import type { ReactElement } from "react";
import { Info } from "@phosphor-icons/react";
import { ActionIcon } from "@mantine/core";
import { AppMetricCard } from "@ui/AppMetricCard/AppMetricCard";
import type { AttentionIssue } from "../../model/attentionIssues";
import type {
  OverviewFleetFilter,
  OverviewFleetStats,
} from "../../model/overviewFleetMetrics";
import { toggleOverviewFleetFilter } from "../../model/overviewFleetMetrics";
import { AttentionIssuesPopover } from "../AttentionIssuesPopover/AttentionIssuesPopover";
import classes from "./OverviewFleetMetrics.module.css";

interface Props {
  stats: OverviewFleetStats;
  attentionIssues: AttentionIssue[];
  fleetFilter: OverviewFleetFilter;
  onFleetFilter: (next: OverviewFleetFilter) => void;
}

export function OverviewFleetMetrics(props: Props): ReactElement {
  const setFilter = (next: OverviewFleetFilter) => {
    props.onFleetFilter(toggleOverviewFleetFilter(props.fleetFilter, next));
  };

  return (
    <div className={classes.strip} data-overview-fleet-metrics>
      <div className={classes.cell}>
        <AppMetricCard
          label="Running"
          value={String(props.stats.runningCount)}
          active={props.fleetFilter === "running"}
          onClick={() => setFilter("running")}
        />
      </div>
      <div className={classes.cell}>
        <AppMetricCard
          label="Stopped"
          value={String(props.stats.stoppedCount)}
          active={props.fleetFilter === "stopped"}
          onClick={() => setFilter("stopped")}
        />
      </div>
      <div className={classes.cell}>
        <AppMetricCard
          label="Needs attention"
          value={String(props.stats.attentionCount)}
          tone="warning"
          active={props.fleetFilter === "attention"}
          onClick={() => setFilter("attention")}
        />
        <AttentionIssuesPopover
          issues={props.attentionIssues}
          target={
            <ActionIcon
              className={classes.attentionInfo}
              variant="subtle"
              color="attention"
              size="sm"
              radius="sm"
              aria-label="Show servers that need attention"
              data-attention-count={props.attentionIssues.length || undefined}
            >
              <Info size={14} weight="bold" />
            </ActionIcon>
          }
        />
      </div>
      <div className={classes.cell}>
        <AppMetricCard
          label="Updates available"
          value={String(props.stats.updatesCount)}
          tone="warning"
          active={props.fleetFilter === "updates"}
          onClick={() => setFilter("updates")}
        />
      </div>
    </div>
  );
}
