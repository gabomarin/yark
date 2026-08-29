import type { ReactElement } from "react";
import { Text } from "@mantine/core";
import { formatClusterSummaryLine } from "../clusterModel";
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
    <Text size="sm" c="dimmed" className={classes.summaryRow} data-cluster-summary>
      {formatClusterSummaryLine(props)}
    </Text>
  );
}
