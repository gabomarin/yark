import type { ReactElement } from "react";
import { Badge, Group } from "@mantine/core";
import classes from "../clusters.module.css";

interface Props {
  clusterCount: number;
  readyCount: number;
  errorCount: number;
  warningOnlyCount: number;
  unclusteredCount: number;
  dirWithoutIdCount: number;
}

export function ClusterSummaryBadges(props: Props): ReactElement {
  return (
    <Group gap="xs" wrap="wrap" className={classes.summaryRow}>
      <Badge variant="light" color="gray" size="sm">
        {props.clusterCount} cluster{props.clusterCount === 1 ? "" : "s"}
      </Badge>
      <Badge variant="light" color="teal" size="sm">
        {props.readyCount} ready
      </Badge>
      {props.errorCount > 0 && (
        <Badge variant="light" color="red" size="sm">
          {props.errorCount} with errors
        </Badge>
      )}
      {props.warningOnlyCount > 0 && (
        <Badge variant="light" color="yellow" size="sm">
          {props.warningOnlyCount} with warnings
        </Badge>
      )}
      {props.unclusteredCount > 0 && (
        <Badge variant="outline" color="gray" size="sm">
          {props.unclusteredCount} server{props.unclusteredCount === 1 ? "" : "s"} not in a
          cluster
        </Badge>
      )}
      {props.dirWithoutIdCount > 0 && (
        <Badge variant="light" color="orange" size="sm">
          {props.dirWithoutIdCount} with directory but no Cluster ID
        </Badge>
      )}
    </Group>
  );
}
