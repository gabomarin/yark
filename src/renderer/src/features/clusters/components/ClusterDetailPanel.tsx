import type { ReactElement } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Group, Stack, Text, Title, Tooltip } from "@mantine/core";
import type { ClusterComplianceReport, ServerProfile, ServerRuntimeInfo } from "@shared/types";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";
import { AppAlert } from "@ui/AppAlert/AppAlert";
import { ReadonlyPath } from "@ui/ReadonlyPath/ReadonlyPath";
import { MetaStrip } from "./MetaStrip/MetaStrip";
import { formatCheckedAt, sharedClusterDir } from "../clusterModel";
import { resolveServerRuntime } from "../createClusterModel";
import { canAddServersToCluster, removeIneligibilityReason } from "../membershipModel";
import classes from "../clusters.module.css";
import { AddServersModal } from "./AddServersModal/AddServersModal";
import { RemoveServersModal } from "./RemoveServersModal/RemoveServersModal";
import { ClusterIniTemplateModal } from "./ClusterIniTemplateModal/ClusterIniTemplateModal";
import { ClusterIniTemplateApplyModal } from "./ClusterIniTemplateApplyModal/ClusterIniTemplateApplyModal";
import { ClusterTributePanel } from "./ClusterTributePanel/ClusterTributePanel";
import type { TransferReviewSummary } from "./ClusterTributePanel/ClusterTributePanel";

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
  const [templateStatusError, setTemplateStatusError] = useState<string | null>(null);
  const [transferReview, setTransferReview] = useState<TransferReviewSummary | null>(null);
  const [applyTarget, setApplyTarget] = useState<{
    serverId: string;
    serverName: string;
    operation: "restore" | "promote";
  } | null>(null);

  const memberStatuses = useMemo(() => {
    return props.members.map((server) => {
      const runtime = resolveServerRuntime(props.statuses, server.id);
      const removeReason = removeIneligibilityReason(runtime);
      return {
        canRemove: removeReason === null,
      };
    });
  }, [props.members, props.statuses]);

  const updateTransferReview = useCallback((summary: TransferReviewSummary): void => {
    setTransferReview(summary);
  }, []);

  const refreshTemplateStatus = async (): Promise<void> => {
    try {
      const result = await window.api.getClusterIniTemplate(props.report.clusterId);
      if (!result.ok) {
        setTemplateStatusError(result.error ?? "Could not load template status");
        setHasTemplate(false);
        return;
      }
      setTemplateStatusError(null);
      setHasTemplate(result.data !== null);
    } catch (error) {
      setTemplateStatusError(error instanceof Error ? error.message : String(error));
      setHasTemplate(false);
    }
  };

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
        setTemplateStatusError(error instanceof Error ? error.message : String(error));
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
      tone="flat"
      padding="md"
      radius={0}
      className={classes.detailPanel}
      data-cluster-detail={props.report.clusterId}
    >
      <Stack gap="md" className={classes.panelStack}>
        {(props.report.issues.length > 0 ||
          (transferReview !== null &&
            (transferReview.differingCount > 0 ||
              transferReview.missingCount > 0 ||
              transferReview.templateDriftCount > 0))) && (
          <AppAlert
            color={props.report.issues.some((issue) => issue.severity === "error") ? "red" : "attention"}
            variant="light"
            title="Cluster needs review"
            data-cluster-review-alert
          >
            <Stack gap="sm">
              {props.report.issues.length > 0 && (
                <Stack gap="xs">
                  <Text size="sm" fw={600}>
                    Compliance
                  </Text>
                  {props.report.issues.map((issue, index) => (
                    <Text key={`${issue.serverId ?? "cluster"}-${index}`} size="sm" lh={1.45}>
                      {issue.serverId === null
                        ? ""
                        : `${props.serverById.get(issue.serverId)?.name ?? issue.serverId}: `}
                      {issue.message}
                    </Text>
                  ))}
                </Stack>
              )}
              {transferReview !== null &&
                (transferReview.differingCount > 0 ||
                  transferReview.missingCount > 0 ||
                  transferReview.templateDriftCount > 0) && (
                  <Stack gap="xs">
                    {props.report.issues.length > 0 && (
                      <Text size="sm" fw={600}>
                        Transfer settings
                      </Text>
                    )}
                    {transferReview.differingCount > 0 && (
                      <Text size="sm" lh={1.45}>
                        {transferReview.differingCount} setting
                        {transferReview.differingCount === 1 ? " differs" : "s differ"} between servers.
                      </Text>
                    )}
                    {transferReview.missingCount > 0 && (
                      <Text size="sm" lh={1.45}>
                        {transferReview.missingCount} setting{transferReview.missingCount === 1 ? " is" : "s are"}{" "}
                        missing on one or more servers.
                      </Text>
                    )}
                    {transferReview.templateDriftCount > 0 && (
                      <Text size="sm" lh={1.45}>
                        {transferReview.templateDriftCount} setting
                        {transferReview.templateDriftCount === 1 ? " differs" : "s differ"} from the saved cluster
                        template.
                      </Text>
                    )}
                    {transferReview.expirationMismatch && (
                      <Text size="sm" lh={1.45}>
                        Different expiration timers can delete stored ARK Data when a player opens tribute on a map with
                        a shorter timer.
                      </Text>
                    )}
                  </Stack>
                )}
            </Stack>
          </AppAlert>
        )}
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
          <Group gap="xs" align="center">
            <Stack gap={2}>
              <Title order={3} size="h4">
                {props.report.clusterId}
              </Title>
              <Text size="xs" c="dimmed">
                Checked {formatCheckedAt(props.report.checkedAt)}
              </Text>
            </Stack>
          </Group>
          <Group gap="xs" wrap="wrap">
            <Button variant="default" onClick={() => setTemplateOpen(true)}>
              {hasTemplate ? "Edit INI template" : "Create INI template"}
            </Button>
            <Tooltip
              label={
                canAdd
                  ? "Assign this cluster’s ID and directory to servers that are not running"
                  : "Align the shared cluster directory on every server first"
              }
            >
              <span>
                <Button disabled={!canAdd} onClick={() => setAddOpen(true)}>
                  Add servers
                </Button>
              </span>
            </Tooltip>
          </Group>
        </Group>

        {templateStatusError !== null && (
          <Text size="xs" c="attention">
            {templateStatusError}
          </Text>
        )}

        <MetaStrip
          className={classes.detailMeta}
          items={[
            {
              label: "Shared cluster directory",
              value: (
                <ReadonlyPath value={sharedDir} emptyLabel="Not the same on every server" compact truncate="start" />
              ),
            },
            { label: "Servers", value: String(props.members.length) },
            {
              label: "INI template",
              value: hasTemplate ? "Saved" : "None",
            },
          ]}
        />

        <ClusterTributePanel
          clusterId={props.report.clusterId}
          onTransferReviewChange={updateTransferReview}
          members={props.members}
          statuses={props.statuses}
          hasTemplate={hasTemplate}
          canRemoveAny={memberStatuses.some((entry) => entry.canRemove)}
          onChanged={props.onMembershipChanged}
          onTemplateChanged={() => {
            void refreshTemplateStatus();
          }}
          onOpenServer={props.onOpenServer}
          onRemoveAll={() => {
            setRemoveInitialIds([]);
            setRemoveOpen(true);
          }}
          onRemoveServer={(serverId) => {
            setRemoveInitialIds([serverId]);
            setRemoveOpen(true);
          }}
          onPromoteToTemplate={(serverId) => {
            const member = props.members.find((row) => row.id === serverId);
            if (member === undefined) return;
            setApplyTarget({ serverId, serverName: member.name, operation: "promote" });
          }}
          onApplyIniTemplate={(serverId) => {
            const member = props.members.find((row) => row.id === serverId);
            if (member === undefined) return;
            setApplyTarget({ serverId, serverName: member.name, operation: "restore" });
          }}
        />
      </Stack>

      {addOpen && (
        <AddServersModal
          opened
          clusterId={props.report.clusterId}
          members={props.members}
          servers={props.servers}
          statuses={props.statuses}
          hasTemplate={hasTemplate}
          onClose={() => setAddOpen(false)}
          onChanged={props.onMembershipChanged}
        />
      )}
      {removeOpen && (
        <RemoveServersModal
          opened
          clusterId={props.report.clusterId}
          members={props.members}
          statuses={props.statuses}
          initialSelectedIds={removeInitialIds}
          onClose={() => setRemoveOpen(false)}
          onChanged={props.onMembershipChanged}
        />
      )}
      {templateOpen && (
        <ClusterIniTemplateModal
          opened
          clusterId={props.report.clusterId}
          onClose={() => setTemplateOpen(false)}
          onChanged={() => {
            void refreshTemplateStatus();
          }}
        />
      )}
      {applyTarget !== null && (
        <ClusterIniTemplateApplyModal
          opened
          clusterId={props.report.clusterId}
          serverId={applyTarget.serverId}
          serverName={applyTarget.serverName}
          operation={applyTarget.operation}
          onClose={() => setApplyTarget(null)}
          onApplied={() => {
            void refreshTemplateStatus();
            props.onMembershipChanged();
          }}
        />
      )}
    </AppSurfaceCard>
  );
}
