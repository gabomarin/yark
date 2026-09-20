import type { ReactElement } from "react";
import { Anchor, Text } from "@mantine/core";
import { formatClusterSummaryLine } from "../clusterModel";
import classes from "../clusters.module.css";

interface Props {
  clusterCount: number;
  readyCount: number;
  errorCount: number;
  warningOnlyCount: number;
  unclusteredCount: number;
  dirWithoutIdCount: number;
  onUnclusteredClick?: () => void;
}

export function ClusterSummaryBadges(props: Props): ReactElement {
  const { onUnclusteredClick, unclusteredCount, ...counts } = props;
  const prefix = formatClusterSummaryLine({
    ...counts,
    unclusteredCount: onUnclusteredClick !== undefined ? 0 : unclusteredCount,
  });
  const unclusteredLabel =
    unclusteredCount === 1 ? "1 server not in a cluster" : `${unclusteredCount} servers not in a cluster`;

  return (
    <Text size="sm" c="dimmed" component="div" className={classes.summaryRow} data-cluster-summary>
      {prefix}
      {onUnclusteredClick !== undefined && unclusteredCount > 0 ? (
        <>
          {prefix.length > 0 ? " · " : ""}
          <Anchor component="button" type="button" size="sm" onClick={onUnclusteredClick}>
            {unclusteredLabel}
          </Anchor>
        </>
      ) : null}
    </Text>
  );
}
