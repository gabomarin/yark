import type { ReactElement } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Group, Stack, Text } from "@mantine/core";
import { AppAlert } from "@ui/AppAlert/AppAlert";
import type { ServerIniSnapshot, ServerProfile, ServerRuntimeInfo } from "@shared/types";
import { setIniTextValue } from "@shared/ini/ini-text";
import {
  CLUSTER_WIDE_TRIBUTE_KEYS,
  readTributeValues,
  summarizeClusterWideValues,
  type ClusterWideTributeKey,
} from "../../tributeModel";
import { ClusterWideSummary } from "./ClusterWideSummary";
import { ClusterMembersTable } from "./ClusterMembersTable";
import { ClusterWideEditor } from "./ClusterWideEditor";
import { MapTributeSummary } from "./MapTributeSummary";

interface Props {
  clusterId: string;
  onTransferReviewChange: (summary: TransferReviewSummary) => void;
  members: ServerProfile[];
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

export interface TransferReviewSummary {
  differingCount: number;
  missingCount: number;
  templateDriftCount: number;
  expirationMismatch: boolean;
}

export function ClusterTributePanel(props: Props): ReactElement {
  const { onChanged, onTransferReviewChange } = props;
  const [snapshots, setSnapshots] = useState<Map<string, ServerIniSnapshot>>(new Map());
  const [templateValues, setTemplateValues] = useState<Partial<Record<ClusterWideTributeKey, string | null>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wideEditOpen, setWideEditOpen] = useState(false);
  const [applyingServerId, setApplyingServerId] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const readGeneration = useRef(0);
  const memberValues = props.members.map((member) => {
    const snapshot = snapshots.get(member.id);
    return snapshot === undefined ? null : readTributeValues(snapshot.payload.gameUserSettings);
  });
  const memberStatus = summarizeClusterWideValues(memberValues.map((values) => values ?? {}));
  const differingCount = CLUSTER_WIDE_TRIBUTE_KEYS.filter((key) => memberStatus[key] === "different").length;
  const missingCount = CLUSTER_WIDE_TRIBUTE_KEYS.filter((key) => memberStatus[key] === "missing").length;
  const templateDriftCount = CLUSTER_WIDE_TRIBUTE_KEYS.filter((key) => {
    const expected = templateValues[key];
    if (expected === null || expected === undefined) return false;
    return memberValues.some((values) => {
      const value = values?.[key];
      return value === null || value === undefined || String(Number(value)) !== String(Number(expected));
    });
  }).length;
  const expirationMismatch = CLUSTER_WIDE_TRIBUTE_KEYS.some(
    (key) => key.startsWith("Tribute") && memberStatus[key] !== "matching",
  );

  useEffect(() => {
    if (loading) return;
    onTransferReviewChange({ differingCount, missingCount, templateDriftCount, expirationMismatch });
  }, [differingCount, expirationMismatch, loading, missingCount, onTransferReviewChange, templateDriftCount]);

  const refresh = useCallback(async (): Promise<void> => {
    const generation = ++readGeneration.current;
    setLoading(true);
    setError(null);
    try {
      const [results, templateResult] = await Promise.all([
        Promise.all(props.members.map((member) => window.api.readServerIni(member.id))),
        window.api.getClusterIniTemplate(props.clusterId),
      ]);
      if (generation !== readGeneration.current) return;
      if (!templateResult.ok) throw new Error(templateResult.error ?? "Could not read the cluster INI template");
      const next = new Map<string, ServerIniSnapshot>();
      for (const result of results) {
        if (!result.ok) throw new Error(result.error ?? "Could not read member INI files");
        next.set(result.data.serverId, result.data);
      }
      setSnapshots(next);
      setTemplateValues(
        templateResult.data === null ? {} : readTributeValues(templateResult.data.payload.gameUserSettings),
      );
    } catch (cause) {
      if (generation !== readGeneration.current) return;
      setError(cause instanceof Error ? cause.message : String(cause));
      setSnapshots(new Map());
      setTemplateValues({});
    } finally {
      if (generation === readGeneration.current) setLoading(false);
    }
  }, [props.clusterId, props.members]);

  const applyToServer = useCallback(
    async (serverId: string): Promise<void> => {
      setApplyingServerId(serverId);
      setApplyError(null);
      try {
        const snapshot = snapshots.get(serverId);
        if (snapshot === undefined) throw new Error("Could not read this server's current INI values");
        const payload = {
          ...snapshot.payload,
          gameUserSettings: CLUSTER_WIDE_TRIBUTE_KEYS.reduce((text, key) => {
            const value = templateValues[key];
            return value === null || value === undefined ? text : setIniTextValue(text, "ServerSettings", key, value);
          }, snapshot.payload.gameUserSettings),
        };
        const preview = await window.api.previewServerIni(serverId, payload);
        if (!preview.ok) throw new Error(preview.error ?? "Could not preview cluster transfer settings");
        if (!preview.data.valid) throw new Error(preview.data.issues.map((issue) => issue.message).join("; "));
        const result = await window.api.saveServerIni(serverId, payload);
        if (!result.ok) throw new Error(result.error ?? "Could not apply cluster transfer settings");
        onChanged();
        await refresh();
      } catch (cause) {
        setApplyError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setApplyingServerId(null);
      }
    },
    [onChanged, refresh, snapshots, templateValues],
  );

  useEffect(() => {
    void refresh();
    return () => {
      readGeneration.current += 1;
    };
  }, [refresh]);

  return (
    <Stack gap="sm" data-cluster-tribute-settings>
      {error !== null && (
        <AppAlert color="red" variant="light" title="Could not read cluster INI values">
          <Stack gap="xs">
            <Text size="sm">{error}</Text>
            <Button variant="default" size="sm" onClick={() => void refresh()}>
              Retry
            </Button>
          </Stack>
        </AppAlert>
      )}
      {loading ? (
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
            snapshots={snapshots}
            templateValues={templateValues}
            hasTemplate={props.hasTemplate}
            applyingTransferServerId={applyingServerId}
            transferApplyError={applyError}
            onOpenServer={props.onOpenServer}
            onPromoteToTemplate={props.onPromoteToTemplate}
            onApplyIniTemplate={props.onApplyIniTemplate}
            onApplyTransferSettings={(serverId) => void applyToServer(serverId)}
            onRemoveServer={props.onRemoveServer}
          />
          <MapTributeSummary members={props.members} snapshots={snapshots} />
        </>
      )}

      <ClusterWideEditor
        opened={wideEditOpen}
        clusterId={props.clusterId}
        members={props.members}
        statuses={props.statuses}
        snapshots={snapshots}
        onClose={() => setWideEditOpen(false)}
        onApplied={() => {
          onChanged();
          props.onTemplateChanged();
          void refresh();
        }}
      />
    </Stack>
  );
}
