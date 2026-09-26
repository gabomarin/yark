import type { ReactElement } from "react";
import { Plus } from "@phosphor-icons/react";
import { Button, Stack, Tabs, Tooltip } from "@mantine/core";
import { PageScaffold } from "@layout/PageScaffold/PageScaffold";
import { AppPageHeader } from "@ui/AppPageHeader/AppPageHeader";
import type { ClusterComplianceReport, ServerProfile, ServerRuntimeInfo } from "@shared/types";
import { useEffect, useMemo, useState } from "react";
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
import { ClusterSummaryBadges } from "./components/ClusterSummaryBadges";
import { CreateClusterModal } from "./components/CreateClusterModal/CreateClusterModal";

interface Props {
  servers: ServerProfile[];
  reports: ClusterComplianceReport[];
  statuses: Map<string, ServerRuntimeInfo>;
  onOpenServer: (serverId: string) => void;
  onRefresh: () => void;
}

export function ClustersPage(props: Props): ReactElement {
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    props.onRefresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-once refresh on first paint
  }, []);

  const serverById = useMemo(() => buildServerById(props.servers), [props.servers]);
  const unclusteredCount = useMemo(
    () => props.servers.filter((server) => server.clusterId === null).length,
    [props.servers],
  );
  const dirWithoutIdServers = useMemo(() => listDirWithoutIdServers(props.servers), [props.servers]);
  const sortedReports = useMemo(() => sortClusterReports(props.reports), [props.reports]);
  const membersByCluster = useMemo(
    () => new Map(sortedReports.map((report) => [report.clusterId, resolveMembers(report, serverById)])),
    [serverById, sortedReports],
  );
  const { errorCount, warningOnlyCount } = useMemo(() => summarizeClusterReports(sortedReports), [sortedReports]);

  const activeClusterId = resolveActiveClusterId(sortedReports, selectedClusterId);

  return (
    <PageScaffold title="Clusters" fillViewport edgeToEdge showHeader={false}>
      <div className={classes.pageShell} data-clusters-page>
        <AppPageHeader title="Clusters" />

        <Stack gap="sm" className={classes.content}>
          <ClusterGuidanceCard defaultOpen={sortedReports.length === 0} />
          <ClusterSummaryBadges
            clusterCount={sortedReports.length}
            readyCount={sortedReports.length - errorCount}
            errorCount={errorCount}
            warningOnlyCount={warningOnlyCount}
            unclusteredCount={unclusteredCount}
            dirWithoutIdCount={dirWithoutIdServers.length}
            onUnclusteredClick={() => {
              if (sortedReports.length > 0) {
                setSelectedClusterId(sortedReports[0]!.clusterId);
                return;
              }
              setCreateOpen(true);
            }}
          />

          {sortedReports.length === 0 ? (
            <ClusterEmptyState
              serverCount={props.servers.length}
              dirWithoutIdServers={dirWithoutIdServers}
              onOpenServer={props.onOpenServer}
              onCreateCluster={() => setCreateOpen(true)}
            />
          ) : (
            <Tabs
              value={activeClusterId}
              onChange={(value) => {
                if (value !== null) setSelectedClusterId(value);
              }}
              variant="default"
              radius="sm"
              className={classes.clusterTabs}
              keepMounted={false}
            >
              <div className={classes.clusterTabBar}>
                <Tabs.List className={classes.clusterTabsList} aria-label="Clusters">
                  {sortedReports.map((report) => (
                    <Tabs.Tab key={report.clusterId} value={report.clusterId}>
                      <Tooltip label={report.clusterId} openDelay={500} disabled={report.clusterId.length < 24}>
                        <span className={classes.clusterTabName}>{report.clusterId}</span>
                      </Tooltip>
                    </Tabs.Tab>
                  ))}
                </Tabs.List>
                <Button
                  size="xs"
                  leftSection={<Plus size={16} weight="bold" />}
                  className={classes.createClusterAction}
                  onClick={() => setCreateOpen(true)}
                >
                  Create cluster
                </Button>
              </div>
              {sortedReports.map((report) => (
                <Tabs.Panel key={report.clusterId} value={report.clusterId} className={classes.clusterTabsPanel}>
                  <ClusterDetailPanel
                    report={report}
                    members={membersByCluster.get(report.clusterId) ?? []}
                    servers={props.servers}
                    statuses={props.statuses}
                    serverById={serverById}
                    onOpenServer={props.onOpenServer}
                    onMembershipChanged={props.onRefresh}
                  />
                </Tabs.Panel>
              ))}
            </Tabs>
          )}
        </Stack>
      </div>

      {createOpen && (
        <CreateClusterModal
          opened
          servers={props.servers}
          statuses={props.statuses}
          onClose={() => setCreateOpen(false)}
          onCreated={props.onRefresh}
        />
      )}
    </PageScaffold>
  );
}
