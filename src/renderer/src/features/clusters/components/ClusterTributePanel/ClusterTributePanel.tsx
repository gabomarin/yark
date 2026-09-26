import type { ReactElement } from "react";
import { useState } from "react";
import { Button, Group, Stack, Text } from "@mantine/core";
import { AppAlert } from "@ui/AppAlert/AppAlert";
import type { ServerIniSnapshot, ServerProfile, ServerRuntimeInfo } from "@shared/types";
import { setIniTextValue } from "@shared/ini/ini-text";
import {
  CLUSTER_WIDE_TRIBUTE_KEYS,
  type ClusterWideTributeKey,
} from "../../tributeModel";
import { ClusterWideSummary } from "./ClusterWideSummary";
import { ClusterMembersTable } from "./ClusterMembersTable";
import { ClusterWideEditor } from "./ClusterWideEditor";
import { MapTributeSummary } from "./MapTributeSummary";

interface Props {
  clusterId: string;
  members: ServerProfile[];
  snapshots: Map<string, ServerIniSnapshot>;
  templateValues: Partial<Record<ClusterWideTributeKey, string | null>>;
  loading: boolean;
  error: string | null;
  onRefresh: () => Promise<void>;
  statuses: Map<string, ServerRuntimeInfo>;
  hasTemplate: boolean;
  canRemoveAny: boolean;
  onChanged: () => void;
  onTemplateChanged: () => void;
  onOpenServer: (serverId: string) => void;
  onRemoveAll: () => void;
  onRemoveServer: (serverId: string) => void;
  onPromoteToTemplate: (serverId: string) => void;
  onApplyIniTemplate: (serverId: string) => void;
}

export function ClusterTributePanel(props: Props): ReactElement {
  const [wideEditOpen, setWideEditOpen] = useState(false);
  const [applyingServerId, setApplyingServerId] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);

  const applyToServer = async (serverId: string): Promise<void> => {
    setApplyingServerId(serverId);
    setApplyError(null);
    try {
      const snapshot = props.snapshots.get(serverId);
      if (snapshot === undefined) throw new Error("Could not read this server's current INI values");
      const payload = {
        ...snapshot.payload,
        gameUserSettings: CLUSTER_WIDE_TRIBUTE_KEYS.reduce((text, key) => {
          const value = props.templateValues[key];
          return value === null || value === undefined ? text : setIniTextValue(text, "ServerSettings", key, value);
        }, snapshot.payload.gameUserSettings),
      };
      const preview = await window.api.previewServerIni(serverId, payload);
      if (!preview.ok) throw new Error(preview.error ?? "Could not preview cluster transfer settings");
      if (!preview.data.valid) throw new Error(preview.data.issues.map((issue) => issue.message).join("; "));
      const result = await window.api.saveServerIni(serverId, payload);
      if (!result.ok) throw new Error(result.error ?? "Could not apply cluster transfer settings");
      props.onChanged();
      await props.onRefresh();
    } catch (cause) {
      setApplyError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setApplyingServerId(null);
    }
  };

  return (
    <Stack gap="sm" data-cluster-tribute-settings>
      {props.error !== null && (
        <AppAlert color="red" variant="light" title="Could not read cluster INI values">
          <Stack gap="xs">
            <Text size="sm">{props.error}</Text>
            <Button variant="default" size="sm" onClick={() => void props.onRefresh()}>
              Retry
            </Button>
          </Stack>
        </AppAlert>
      )}
      {props.loading ? (
        <Text size="sm" c="dimmed" role="status">
          Reading GameUserSettings.ini on cluster members…
        </Text>
      ) : (
        <>
          <ClusterWideSummary onEdit={() => setWideEditOpen(true)} />
          <Group justify="space-between" align="center">
            <Text fw={600} size="sm">
              Cluster members
            </Text>
            <Button color="red" variant="subtle" disabled={!props.canRemoveAny} onClick={props.onRemoveAll}>
              Remove servers
            </Button>
          </Group>
          <ClusterMembersTable
            clusterId={props.clusterId}
            members={props.members}
            statuses={props.statuses}
            snapshots={props.snapshots}
            templateValues={props.templateValues}
            hasTemplate={props.hasTemplate}
            applyingTransferServerId={applyingServerId}
            transferApplyError={applyError}
            onOpenServer={props.onOpenServer}
            onPromoteToTemplate={props.onPromoteToTemplate}
            onApplyIniTemplate={props.onApplyIniTemplate}
            onApplyTransferSettings={(serverId) => void applyToServer(serverId)}
            onRemoveServer={props.onRemoveServer}
          />
          <MapTributeSummary members={props.members} snapshots={props.snapshots} />
        </>
      )}

      <ClusterWideEditor
        opened={wideEditOpen}
        clusterId={props.clusterId}
        members={props.members}
        statuses={props.statuses}
        snapshots={props.snapshots}
        onClose={() => setWideEditOpen(false)}
        onApplied={() => {
          props.onChanged();
          props.onTemplateChanged();
        }}
      />
    </Stack>
  );
}
