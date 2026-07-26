import { Card, Stack, Text, Title } from "@mantine/core";
import type { ClusterComplianceReport, ServerProfile } from "@shared/types";
import { sharedClusterDir } from "../clusterModel";
import classes from "../clusters.module.css";
import { ClusterStatusBadge } from "./ClusterStatusBadge";

interface Props {
  reports: ClusterComplianceReport[];
  serverById: Map<string, ServerProfile>;
  activeClusterId: string | null;
  onSelect: (clusterId: string) => void;
}

export function ClusterListPanel(props: Props): JSX.Element {
  return (
    <Card withBorder className={`${classes.panel} ${classes.listPanel}`}>
      <Stack gap="sm" className={classes.panelStack}>
        <Title order={3} size="h4">
          Clusters
        </Title>
        <div className={classes.clusterList}>
          {props.reports.map((report) => {
            const members = report.members
              .map((id) => props.serverById.get(id))
              .filter((server): server is ServerProfile => server !== undefined);
            const dir = sharedClusterDir(members);
            const selected = report.clusterId === props.activeClusterId;
            return (
              <button
                key={report.clusterId}
                type="button"
                className={`${classes.clusterRow} ${selected ? classes.clusterRowActive : ""}`}
                data-cluster-card={report.clusterId}
                aria-pressed={selected}
                onClick={() => props.onSelect(report.clusterId)}
              >
                <div className={classes.clusterRowInner}>
                  <div className={classes.clusterSummary}>
                    <Text fw={600} className={classes.clusterTitle}>
                      {report.clusterId}
                    </Text>
                    <Text size="xs" c="dimmed" className={classes.clusterMeta}>
                      {report.members.length} member
                      {report.members.length === 1 ? "" : "s"}
                      {dir !== null ? ` · ${dir}` : " · mixed or missing dirs"}
                    </Text>
                  </div>
                  <ClusterStatusBadge report={report} />
                </div>
              </button>
            );
          })}
        </div>
      </Stack>
    </Card>
  );
}
