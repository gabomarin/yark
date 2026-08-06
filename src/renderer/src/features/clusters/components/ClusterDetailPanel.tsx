import type { ReactElement } from "react";
import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Group, Stack, Text, Title, Tooltip } from "@mantine/core";
import type {
  ClusterComplianceReport,
  ServerProfile,
  ServerRuntimeInfo,
} from "@shared/types";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";
import { ReadonlyPath } from "@ui/ReadonlyPath/ReadonlyPath";
import { MetaStrip } from "./MetaStrip/MetaStrip";
import { formatCheckedAt, sharedClusterDir } from "../clusterModel";
import { resolveServerStatus } from "../createClusterModel";
import {
  canAddServersToCluster,
  removeIneligibilityReason,
} from "../membershipModel";
import classes from "../clusters.module.css";
import { ClusterIssueRow } from "./ClusterIssueRow";
import { ClusterMemberRow } from "./ClusterMemberRow";
import { AddServersModal } from "./AddServersModal/AddServersModal";
import { RemoveServersModal } from "./RemoveServersModal/RemoveServersModal";
import { ClusterIniTemplateModal } from "./ClusterIniTemplateModal/ClusterIniTemplateModal";

interface Props {
  report: ClusterComplianceReport;
  members: ServerProfile[];
  servers: ServerProfile[];
  statuses: Map<string, ServerRuntimeInfo>;
  serverById: Map<string, ServerProfile>;
  onOpenServer: (serverId: string) => void;
  onMembershipChanged: () => void;
}

export function ClusterDetailPanel(props: Props): ReactElement {
  const sharedDir = sharedClusterDir(props.members);
  const canAdd = canAddServersToCluster(props.members);
  const [addOpen, setAddOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removeInitialIds, setRemoveInitialIds] = useState<string[]>([]);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [hasTemplate, setHasTemplate] = useState(false);
  const [templateStatusError, setTemplateStatusError] = useState<string | null>(
    null,
  );

  const memberStatuses = useMemo(() => {
    return props.members.map((server) => {
      const status = resolveServerStatus(props.statuses, server.id);
      const removeReason = removeIneligibilityReason(status);
      return { server, status, removeReason, canRemove: removeReason === null };
    });
  }, [props.members, props.statuses]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await window.api.getClusterIniTemplate(props.report.clusterId);
        if (cancelled) return;
        if (!result.ok) {
          setTemplateStatusError(result.error ?? "Could not load template status");
          setHasTemplate(false);
          return;
        }
        setTemplateStatusError(null);
        setHasTemplate(result.data !== null);
      } catch (error) {
        if (cancelled) return;
        setTemplateStatusError(
          error instanceof Error ? error.message : String(error),
        );
        setHasTemplate(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.report.clusterId, templateOpen]);

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
          <Group gap="xs" wrap="wrap">
            <Badge size="lg" color={props.report.ok ? "teal" : "red"} variant="light">
              {props.report.ok ? "Transfer-ready config" : "Needs fixes"}
            </Badge>
            <Button size="sm" variant="light" onClick={() => setTemplateOpen(true)}>
              {hasTemplate ? "Edit INI template" : "Create INI template"}
            </Button>
            <Tooltip
              label={
                canAdd
                  ? "Assign this cluster’s ID and directory to stopped servers"
                  : "Align the shared cluster directory on every server first"
              }
            >
              <span>
                <Button size="sm" disabled={!canAdd} onClick={() => setAddOpen(true)}>
                  Add servers
                </Button>
              </span>
            </Tooltip>
          </Group>
        </Group>

        {templateStatusError !== null && (
          <Text size="xs" c="orange">
            {templateStatusError}
          </Text>
        )}

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
            {
              label: "INI template",
              value: hasTemplate ? "Saved" : "None",
            },
          ]}
        />

        <Stack gap="xs">
          <Group justify="space-between" align="center">
            <Text fw={600} size="sm">
              Servers in this cluster
            </Text>
            <Button
              size="compact-xs"
              variant="default"
              disabled={
                !memberStatuses.some((entry) => entry.canRemove)
              }
              onClick={() => {
                setRemoveInitialIds([]);
                setRemoveOpen(true);
              }}
            >
              Remove servers
            </Button>
          </Group>
          {props.members.length === 0 ? (
            <Text size="sm" c="dimmed">
              Server profiles could not be resolved.
            </Text>
          ) : (
            <div className={classes.memberList}>
              {memberStatuses.map(({ server, status, canRemove, removeReason }) => (
                <ClusterMemberRow
                  key={server.id}
                  server={server}
                  status={status}
                  canRemove={canRemove}
                  removeReason={removeReason}
                  subtitle={`${server.map}${
                    server.clusterDir !== null
                      ? ` · ${server.clusterDir}`
                      : " · no cluster directory"
                  }`}
                  onOpen={props.onOpenServer}
                  onRemove={(serverId) => {
                    setRemoveInitialIds([serverId]);
                    setRemoveOpen(true);
                  }}
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

      <AddServersModal
        opened={addOpen}
        clusterId={props.report.clusterId}
        members={props.members}
        servers={props.servers}
        statuses={props.statuses}
        onClose={() => setAddOpen(false)}
        onChanged={props.onMembershipChanged}
      />
      <RemoveServersModal
        opened={removeOpen}
        clusterId={props.report.clusterId}
        members={props.members}
        statuses={props.statuses}
        initialSelectedIds={removeInitialIds}
        onClose={() => setRemoveOpen(false)}
        onChanged={props.onMembershipChanged}
      />
      <ClusterIniTemplateModal
        opened={templateOpen}
        clusterId={props.report.clusterId}
        onClose={() => setTemplateOpen(false)}
        onChanged={() => {
          void window.api.getClusterIniTemplate(props.report.clusterId).then((result) => {
            if (result.ok) {
              setHasTemplate(result.data !== null);
              setTemplateStatusError(null);
            }
          });
        }}
      />
    </AppSurfaceCard>
  );
}
