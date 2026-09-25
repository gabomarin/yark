import type { ReactElement } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Stack, Text } from "@mantine/core";
import type { ServerIniSnapshot, ServerProfile, ServerRuntimeInfo } from "@shared/types";
import { ClusterWideSummary } from "./ClusterWideSummary";
import { ClusterWideEditor } from "./ClusterWideEditor";
import { MapTributeSummary } from "./MapTributeSummary";
import { MapTributeEditor } from "./MapTributeEditor";

interface Props {
  clusterId: string;
  members: ServerProfile[];
  statuses: Map<string, ServerRuntimeInfo>;
  onChanged: () => void;
}

export function ClusterTributePanel(props: Props): ReactElement {
  const [snapshots, setSnapshots] = useState<Map<string, ServerIniSnapshot>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wideEditOpen, setWideEditOpen] = useState(false);
  const [mapEditOpen, setMapEditOpen] = useState(false);
  const readGeneration = useRef(0);

  const refresh = useCallback(async (): Promise<void> => {
    const generation = ++readGeneration.current;
    setLoading(true);
    setError(null);
    try {
      const results = await Promise.all(props.members.map((member) => window.api.readServerIni(member.id)));
      if (generation !== readGeneration.current) return;
      const next = new Map<string, ServerIniSnapshot>();
      for (const result of results) {
        if (!result.ok) throw new Error(result.error ?? "Could not read member INI files");
        next.set(result.data.serverId, result.data);
      }
      setSnapshots(next);
    } catch (cause) {
      if (generation !== readGeneration.current) return;
      setError(cause instanceof Error ? cause.message : String(cause));
      setSnapshots(new Map());
    } finally {
      if (generation === readGeneration.current) setLoading(false);
    }
  }, [props.members]);

  useEffect(() => {
    void refresh();
    return () => {
      readGeneration.current += 1;
    };
  }, [refresh]);

  return (
    <Stack gap="sm" data-cluster-tribute-settings>
      <div>
        <Text fw={600} size="sm">
          Transfer / tribute
        </Text>
        <Text size="xs" c="dimmed">
          Expiration timers and upload slots should match across the cluster. A shorter timer can delete stored ARK
          Data.
        </Text>
      </div>
      {error !== null && (
        <Alert color="red" title="Could not read cluster INI values">
          <Stack gap="xs">
            <Text size="sm">{error}</Text>
            <Button variant="default" size="sm" onClick={() => void refresh()}>
              Retry
            </Button>
          </Stack>
        </Alert>
      )}
      {loading ? (
        <Text size="sm" c="dimmed" role="status">
          Reading GameUserSettings.ini on cluster members…
        </Text>
      ) : (
        <>
          <ClusterWideSummary
            clusterId={props.clusterId}
            members={props.members}
            statuses={props.statuses}
            snapshots={snapshots}
            onEdit={() => setWideEditOpen(true)}
          />
          <MapTributeSummary
            members={props.members}
            statuses={props.statuses}
            snapshots={snapshots}
            onEdit={() => setMapEditOpen(true)}
          />
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
          props.onChanged();
          void refresh();
        }}
      />

      <MapTributeEditor
        opened={mapEditOpen}
        members={props.members}
        statuses={props.statuses}
        snapshots={snapshots}
        onClose={() => setMapEditOpen(false)}
        onSaved={() => {
          props.onChanged();
          void refresh();
        }}
      />
    </Stack>
  );
}
