import { Button, Stack } from "@mantine/core";
import { PageScaffold } from "@layout/PageScaffold/PageScaffold";
import type { ClusterComplianceReport, ServerProfile } from "@shared/types";
import { useMemo, useState } from "react";
import {
  buildServerById,
  listDirWithoutIdServers,
  resolveActiveClusterId,
  resolveMembers,
  sortClusterReports,
  summarizeClusterReports,
} from "./clusterModel";
import classes from "./clusters.module.css";
import { ClusterDetailPanel } from "./components/ClusterDetailPanel";
import { ClusterEmptyState } from "./components/ClusterEmptyState";
import { ClusterGuidanceCard } from "./components/ClusterGuidanceCard";
import { ClusterListPanel } from "./components/ClusterListPanel";
import { ClusterSummaryBadges } from "./components/ClusterSummaryBadges";

interface Props {
  servers: ServerProfile[];
  reports: ClusterComplianceReport[];
  onOpenServer: (serverId: string) => void;
  onRefresh: () => void;
}

export function ClustersPage(props: Props): JSX.Element {
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);

  const serverById = useMemo(() => buildServerById(props.servers), [props.servers]);
  const unclusteredCount = useMemo(
    () => props.servers.filter((server) => server.clusterId === null).length,
    [props.servers],
  );
  const dirWithoutIdServers = useMemo(
    () => listDirWithoutIdServers(props.servers),
    [props.servers],
  );
  const sortedReports = useMemo(() => sortClusterReports(props.reports), [props.reports]);
  const { errorCount, warningOnlyCount } = useMemo(
    () => summarizeClusterReports(sortedReports),
    [sortedReports],
  );

  const activeClusterId = resolveActiveClusterId(sortedReports, selectedClusterId);
  const activeReport =
    activeClusterId === null
      ? null
      : (sortedReports.find((report) => report.clusterId === activeClusterId) ?? null);
  const activeMembers = resolveMembers(activeReport, serverById);

  return (
    <PageScaffold
      title="Clusters"
      subtitle="Compatibility checks and guidance for Cluster ID and shared cluster directory across your maps"
      fillViewport
      actions={
        <Button variant="default" onClick={props.onRefresh}>
          Recheck
        </Button>
      }
    >
      <Stack gap="md" className={classes.content} data-clusters-page>
        <ClusterGuidanceCard />
        <ClusterSummaryBadges
          clusterCount={sortedReports.length}
          readyCount={sortedReports.length - errorCount}
          errorCount={errorCount}
          warningOnlyCount={warningOnlyCount}
          unclusteredCount={unclusteredCount}
          dirWithoutIdCount={dirWithoutIdServers.length}
        />

        {sortedReports.length === 0 ? (
          <ClusterEmptyState
            serverCount={props.servers.length}
            dirWithoutIdServers={dirWithoutIdServers}
            onOpenServer={props.onOpenServer}
          />
        ) : (
          <div className={classes.layout}>
            <ClusterListPanel
              reports={sortedReports}
              serverById={serverById}
              activeClusterId={activeClusterId}
              onSelect={setSelectedClusterId}
            />
            {activeReport !== null && (
              <ClusterDetailPanel
                report={activeReport}
                members={activeMembers}
                serverById={serverById}
                onOpenServer={props.onOpenServer}
              />
            )}
          </div>
        )}
      </Stack>
    </PageScaffold>
  );
}
