import type { ReactElement } from "react";
import { Badge, Group, Stack, Text, Title } from "@mantine/core";
import type { ClusterComplianceReport, ServerProfile } from "@shared/types";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";
import { ReadonlyPath } from "@ui/ReadonlyPath/ReadonlyPath";
import { MetaStrip } from "./MetaStrip/MetaStrip";
import { formatCheckedAt, sharedClusterDir } from "../clusterModel";
import classes from "../clusters.module.css";
import { ClusterIssueRow } from "./ClusterIssueRow";
import { ClusterMemberRow } from "./ClusterMemberRow";

interface Props {
  report: ClusterComplianceReport;
  members: ServerProfile[];
  serverById: Map<string, ServerProfile>;
  onOpenServer: (serverId: string) => void;
}

export function ClusterDetailPanel(props: Props): ReactElement {
  const sharedDir = sharedClusterDir(props.members);

  return (
    <AppSurfaceCard
      fill
      className={classes.detailPanel}
      statusTone={props.report.ok ? "ok" : "error"}
      data-cluster-detail={props.report.clusterId}
    >
      <Stack gap="md" className={classes.panelStack}>
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
          <div>
            <Title order={3} size="h4">
              {props.report.clusterId}
            </Title>
            <Text size="sm" c="dimmed">
              Checked {formatCheckedAt(props.report.checkedAt)}
            </Text>
          </div>
          <Badge size="lg" color={props.report.ok ? "teal" : "red"} variant="light">
            {props.report.ok ? "Transfer-ready config" : "Needs fixes"}
          </Badge>
        </Group>

        <MetaStrip
          items={[
            {
              label: "Shared cluster directory",
              value: (
                <ReadonlyPath
                  value={sharedDir}
                  emptyLabel="Not the same on every server"
                  compact
                />
              ),
            },
            { label: "Servers", value: String(props.members.length) },
            { label: "Issues", value: String(props.report.issues.length) },
          ]}
        />

        <Stack gap="xs">
          <Text fw={600} size="sm">
            Servers in this cluster
          </Text>
          {props.members.length === 0 ? (
            <Text size="sm" c="dimmed">
              Server profiles could not be resolved.
            </Text>
          ) : (
            <div className={classes.memberList}>
              {props.members.map((server) => (
                <ClusterMemberRow
                  key={server.id}
                  server={server}
                  subtitle={`${server.map}${
                    server.clusterDir !== null
                      ? ` · ${server.clusterDir}`
                      : " · no cluster directory"
                  }`}
                  trailing="Open"
                  onOpen={props.onOpenServer}
                />
              ))}
            </div>
          )}
        </Stack>

        <Stack gap="xs" className={classes.issuesBlock}>
          <Text fw={600} size="sm">
            Compliance
          </Text>
          {props.report.issues.length === 0 ? (
            <Text size="sm" c="dimmed">
              No issues. Servers share a coherent cluster setup for transfers.
            </Text>
          ) : (
            <ul className={classes.issueList}>
              {props.report.issues.map((issue) => (
                <ClusterIssueRow
                  key={`${issue.severity}-${issue.serverId ?? "fleet"}-${issue.message}`}
                  issue={issue}
                  relatedServerName={
                    issue.serverId !== null
                      ? (props.serverById.get(issue.serverId)?.name ?? issue.serverId)
                      : null
                  }
                />
              ))}
            </ul>
          )}
        </Stack>
      </Stack>
    </AppSurfaceCard>
  );
}
