import type { ReactElement } from "react";
import { Stack, Text, Title } from "@mantine/core";
import type { ClusterComplianceReport, ServerProfile } from "@shared/types";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";
import { SelectableListRow } from "@ui/SelectableListRow/SelectableListRow";
import { sharedClusterDir } from "../clusterModel";
import classes from "../clusters.module.css";
import { ClusterStatusBadge } from "./ClusterStatusBadge";

interface Props {
  reports: ClusterComplianceReport[];
  serverById: Map<string, ServerProfile>;
  activeClusterId: string | null;
  onSelect: (clusterId: string) => void;
}

export function ClusterListPanel(props: Props): ReactElement {
  return (
    <AppSurfaceCard fill className={classes.listPanel}>
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
              <SelectableListRow
                key={report.clusterId}
                selected={selected}
                data-cluster-card={report.clusterId}
                onClick={() => props.onSelect(report.clusterId)}
                trailing={<ClusterStatusBadge report={report} />}
              >
                <Text fw={600} className={classes.clusterTitle}>
                  {report.clusterId}
                </Text>
                <Text size="xs" c="dimmed" className={classes.clusterMeta}>
                  {report.members.length} member
                  {report.members.length === 1 ? "" : "s"}
                  {dir !== null ? ` · ${dir}` : " · mixed or missing dirs"}
                </Text>
              </SelectableListRow>
            );
          })}
        </div>
      </Stack>
    </AppSurfaceCard>
  );
}
