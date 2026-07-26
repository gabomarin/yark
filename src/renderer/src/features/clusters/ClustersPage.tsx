import {
  ArrowsLeftRight,
  CheckCircle,
  FolderSimple,
  WarningCircle,
  Warning,
} from "@phosphor-icons/react";
import { Badge, Button, Card, Group, Stack, Text, Title } from "@mantine/core";
import { PageScaffold } from "@layout/PageScaffold/PageScaffold";
import type { ClusterComplianceReport, ServerProfile } from "@shared/types";
import { useMemo, useState } from "react";
import classes from "./ClustersPage.module.css";

interface Props {
  servers: ServerProfile[];
  reports: ClusterComplianceReport[];
  onOpenServer: (serverId: string) => void;
  onRefresh: () => void;
}

function formatCheckedAt(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return iso;
  return date.toLocaleString();
}

function sharedClusterDir(members: ServerProfile[]): string | null {
  const dirs = [
    ...new Set(
      members
        .map((member) => member.clusterDir)
        .filter((dir): dir is string => dir !== null && dir.length > 0),
    ),
  ];
  if (dirs.length === 1) return dirs[0] ?? null;
  return null;
}

export function ClustersPage(props: Props): JSX.Element {
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);

  const serverById = useMemo(() => {
    const map = new Map<string, ServerProfile>();
    for (const server of props.servers) {
      map.set(server.id, server);
    }
    return map;
  }, [props.servers]);

  const unclusteredCount = useMemo(
    () => props.servers.filter((server) => server.clusterId === null).length,
    [props.servers],
  );

  const dirWithoutIdServers = useMemo(
    () =>
      props.servers.filter(
        (server) =>
          server.clusterId === null &&
          server.clusterDir !== null &&
          server.clusterDir.length > 0,
      ),
    [props.servers],
  );

  const sortedReports = useMemo(() => {
    return [...props.reports].sort((a, b) => {
      if (a.ok !== b.ok) return a.ok ? 1 : -1;
      return a.clusterId.localeCompare(b.clusterId);
    });
  }, [props.reports]);

  const activeClusterId =
    selectedClusterId !== null &&
    sortedReports.some((report) => report.clusterId === selectedClusterId)
      ? selectedClusterId
      : (sortedReports[0]?.clusterId ?? null);

  const activeReport =
    activeClusterId === null
      ? null
      : (sortedReports.find((report) => report.clusterId === activeClusterId) ?? null);

  const activeMembers =
    activeReport === null
      ? []
      : activeReport.members
          .map((id) => serverById.get(id))
          .filter((server): server is ServerProfile => server !== undefined);

  const activeDir = sharedClusterDir(activeMembers);
  const errorCount = sortedReports.filter((report) => !report.ok).length;
  const warningOnlyCount = sortedReports.filter(
    (report) =>
      report.ok && report.issues.some((issue) => issue.severity === "warning"),
  ).length;

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
        <Card withBorder className={classes.guidanceCard}>
          <Group gap="sm" align="flex-start" wrap="nowrap">
            <div className={classes.guidanceIcon}>
              <ArrowsLeftRight size={20} />
            </div>
            <Stack gap={4} className={classes.guidanceCopy}>
              <Title order={3} size="h4">
                How transfers work here
              </Title>
              <Text size="sm" c="dimmed">
                Members of the same <Text span fw={600}>Cluster ID</Text> must share one{" "}
                <Text span fw={600}>cluster directory</Text> so ARK can move creatures and items
                between maps. Both fields are required: a directory alone does not register a
                cluster here. Assign them on each server (form or workspace checklist). This page
                surfaces the compliance checks the backend already runs — it does not validate live
                transfers yet.
              </Text>
            </Stack>
          </Group>
        </Card>

        <Group gap="sm" wrap="wrap" className={classes.summaryRow}>
          <Badge variant="light" color="gray" size="lg">
            {sortedReports.length} cluster{sortedReports.length === 1 ? "" : "s"}
          </Badge>
          <Badge variant="light" color="teal" size="lg">
            {sortedReports.length - errorCount} ready
          </Badge>
          {errorCount > 0 && (
            <Badge variant="light" color="red" size="lg">
              {errorCount} with errors
            </Badge>
          )}
          {warningOnlyCount > 0 && (
            <Badge variant="light" color="yellow" size="lg">
              {warningOnlyCount} with warnings
            </Badge>
          )}
          {unclusteredCount > 0 && (
            <Badge variant="outline" color="gray" size="lg">
              {unclusteredCount} server{unclusteredCount === 1 ? "" : "s"} not in a cluster
            </Badge>
          )}
          {dirWithoutIdServers.length > 0 && (
            <Badge variant="light" color="orange" size="lg">
              {dirWithoutIdServers.length} with directory but no Cluster ID
            </Badge>
          )}
        </Group>

        {sortedReports.length === 0 ? (
          <Card withBorder className={classes.emptyCard}>
            <div className={classes.emptyState}>
              <div className={classes.emptyIcon}>
                <FolderSimple size={24} />
              </div>
              <Text fw={600}>No clusters configured</Text>
              {dirWithoutIdServers.length > 0 ? (
                <Stack gap="sm" className={classes.incompleteBlock}>
                  <Text c="dimmed" size="sm" ta="center" maw={480}>
                    {dirWithoutIdServers.length === 1
                      ? "One server has a shared cluster directory but no Cluster ID. Open it and set a Cluster ID — use the same ID on every map that should transfer together."
                      : `${dirWithoutIdServers.length} servers have a shared cluster directory but no Cluster ID. Open each and set the same Cluster ID on every map that should transfer together.`}
                  </Text>
                  <div className={classes.incompleteList} data-incomplete-clusters>
                    {[
                      ...dirWithoutIdServers
                        .reduce((groups, server) => {
                          const dir = server.clusterDir ?? "";
                          const list = groups.get(dir) ?? [];
                          list.push(server);
                          groups.set(dir, list);
                          return groups;
                        }, new Map<string, ServerProfile[]>())
                        .entries(),
                    ].map(([dir, members]) => (
                      <div key={dir} className={classes.incompleteGroup}>
                        <Text size="xs" c="dimmed" className={classes.incompleteDir}>
                          {dir}
                        </Text>
                        <div className={classes.memberList}>
                          {members.map((server) => (
                            <button
                              key={server.id}
                              type="button"
                              className={classes.memberRow}
                              onClick={() => props.onOpenServer(server.id)}
                            >
                              <div className={classes.memberCopy}>
                                <Text fw={600} size="sm">
                                  {server.name}
                                </Text>
                                <Text size="xs" c="dimmed">
                                  {server.map} · missing Cluster ID
                                </Text>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </Stack>
              ) : (
                <Text c="dimmed" size="sm" maw={480} ta="center">
                  {props.servers.length === 0
                    ? "Create a server first, then set a Cluster ID and shared cluster directory so maps can transfer together."
                    : "Open a server and set the same Cluster ID plus one shared cluster directory on two or more maps to see compliance here."}
                </Text>
              )}
            </div>
          </Card>
        ) : (
          <div className={classes.layout}>
            <Card withBorder className={`${classes.panel} ${classes.listPanel}`}>
              <Stack gap="sm" className={classes.panelStack}>
                <Title order={3} size="h4">
                  Clusters
                </Title>
                <div className={classes.clusterList}>
                  {sortedReports.map((report) => {
                    const members = report.members
                      .map((id) => serverById.get(id))
                      .filter((server): server is ServerProfile => server !== undefined);
                    const dir = sharedClusterDir(members);
                    const hasWarnings = report.issues.some(
                      (issue) => issue.severity === "warning",
                    );
                    const selected = report.clusterId === activeClusterId;
                    return (
                      <button
                        key={report.clusterId}
                        type="button"
                        className={`${classes.clusterRow} ${selected ? classes.clusterRowActive : ""}`}
                        data-cluster-card={report.clusterId}
                        aria-pressed={selected}
                        onClick={() => setSelectedClusterId(report.clusterId)}
                      >
                        <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
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
                          <Badge
                            color={report.ok ? (hasWarnings ? "yellow" : "teal") : "red"}
                            variant="light"
                            leftSection={
                              report.ok ? (
                                hasWarnings ? (
                                  <Warning size={12} />
                                ) : (
                                  <CheckCircle size={12} />
                                )
                              ) : (
                                <WarningCircle size={12} />
                              )
                            }
                          >
                            {report.ok ? (hasWarnings ? "Warnings" : "Ready") : "Errors"}
                          </Badge>
                        </Group>
                      </button>
                    );
                  })}
                </div>
              </Stack>
            </Card>

            {activeReport !== null && (
              <Card
                withBorder
                className={`${classes.panel} ${classes.detailPanel}`}
                data-cluster-detail={activeReport.clusterId}
                data-tone={activeReport.ok ? "ok" : "error"}
              >
                <Stack gap="md" className={classes.panelStack}>
                  <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
                    <div>
                      <Title order={3} size="h4">
                        {activeReport.clusterId}
                      </Title>
                      <Text size="sm" c="dimmed">
                        Checked {formatCheckedAt(activeReport.checkedAt)}
                      </Text>
                    </div>
                    <Badge
                      size="lg"
                      color={activeReport.ok ? "teal" : "red"}
                      variant="light"
                    >
                      {activeReport.ok ? "Transfer-ready config" : "Needs fixes"}
                    </Badge>
                  </Group>

                  <div className={classes.metaStrip}>
                    <div className={classes.metaItem}>
                      <Text size="xs" c="dimmed" className={classes.metaLabel}>
                        Shared clusterDir
                      </Text>
                      <Text size="sm" fw={600} className={classes.metaValue}>
                        {activeDir ?? "Not consistent across members"}
                      </Text>
                    </div>
                    <div className={classes.metaItem}>
                      <Text size="xs" c="dimmed" className={classes.metaLabel}>
                        Members
                      </Text>
                      <Text size="sm" fw={600}>
                        {activeMembers.length}
                      </Text>
                    </div>
                    <div className={classes.metaItem}>
                      <Text size="xs" c="dimmed" className={classes.metaLabel}>
                        Issues
                      </Text>
                      <Text size="sm" fw={600}>
                        {activeReport.issues.length}
                      </Text>
                    </div>
                  </div>

                  <Stack gap="xs">
                    <Text fw={600} size="sm">
                      Member servers
                    </Text>
                    {activeMembers.length === 0 ? (
                      <Text size="sm" c="dimmed">
                        Member profiles could not be resolved.
                      </Text>
                    ) : (
                      <div className={classes.memberList}>
                        {activeMembers.map((server) => (
                          <button
                            key={server.id}
                            type="button"
                            className={classes.memberRow}
                            onClick={() => props.onOpenServer(server.id)}
                          >
                            <div className={classes.memberCopy}>
                              <Text fw={600} size="sm">
                                {server.name}
                              </Text>
                              <Text size="xs" c="dimmed">
                                {server.map}
                                {server.clusterDir !== null
                                  ? ` · ${server.clusterDir}`
                                  : " · no clusterDir"}
                              </Text>
                            </div>
                            <Text size="xs" c="dimmed">
                              Open
                            </Text>
                          </button>
                        ))}
                      </div>
                    )}
                  </Stack>

                  <Stack gap="xs" className={classes.issuesBlock}>
                    <Text fw={600} size="sm">
                      Compliance
                    </Text>
                    {activeReport.issues.length === 0 ? (
                      <Text size="sm" c="dimmed">
                        No issues. Members share a coherent cluster setup for transfers.
                      </Text>
                    ) : (
                      <ul className={classes.issueList}>
                        {activeReport.issues.map((issue, index) => {
                          const memberName =
                            issue.serverId !== null
                              ? (serverById.get(issue.serverId)?.name ?? issue.serverId)
                              : null;
                          return (
                            <li
                              key={`${issue.severity}-${index}-${issue.message}`}
                              className={classes.issueRow}
                              data-severity={issue.severity}
                            >
                              <span className={classes.issueIcon}>
                                {issue.severity === "error" ? (
                                  <WarningCircle size={16} />
                                ) : (
                                  <Warning size={16} />
                                )}
                              </span>
                              <div className={classes.issueCopy}>
                                <Text size="sm">{issue.message}</Text>
                                {memberName !== null && (
                                  <Text size="xs" c="dimmed">
                                    Related server: {memberName}
                                  </Text>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </Stack>
                </Stack>
              </Card>
            )}
          </div>
        )}
      </Stack>
    </PageScaffold>
  );
}
