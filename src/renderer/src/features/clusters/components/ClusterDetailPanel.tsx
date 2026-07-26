import { Badge, Card, Group, Stack, Text, Title } from "@mantine/core";
import type { ClusterComplianceReport, ServerProfile } from "@shared/types";
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

export function ClusterDetailPanel(props: Props): JSX.Element {
  const sharedDir = sharedClusterDir(props.members);

  return (
    <Card
      withBorder
      className={`${classes.panel} ${classes.detailPanel}`}
      data-cluster-detail={props.report.clusterId}
      data-tone={props.report.ok ? "ok" : "error"}
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

        <div className={classes.metaStrip}>
          <div className={classes.metaItem}>
            <Text size="xs" c="dimmed" className={classes.metaLabel}>
              Shared cluster directory
            </Text>
            <Text size="sm" fw={600} className={classes.metaValue}>
              {sharedDir ?? "Not consistent across members"}
            </Text>
          </div>
          <div className={classes.metaItem}>
            <Text size="xs" c="dimmed" className={classes.metaLabel}>
              Members
            </Text>
            <Text size="sm" fw={600}>
              {props.members.length}
            </Text>
          </div>
          <div className={classes.metaItem}>
            <Text size="xs" c="dimmed" className={classes.metaLabel}>
              Issues
            </Text>
            <Text size="sm" fw={600}>
              {props.report.issues.length}
            </Text>
          </div>
        </div>

        <Stack gap="xs">
          <Text fw={600} size="sm">
            Member servers
          </Text>
          {props.members.length === 0 ? (
            <Text size="sm" c="dimmed">
              Member profiles could not be resolved.
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
              No issues. Members share a coherent cluster setup for transfers.
            </Text>
          ) : (
            <ul className={classes.issueList}>
              {props.report.issues.map((issue, index) => (
                <ClusterIssueRow
                  key={`${issue.severity}-${index}-${issue.message}`}
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
    </Card>
  );
}
