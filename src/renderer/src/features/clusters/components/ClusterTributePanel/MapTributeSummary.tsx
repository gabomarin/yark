import type { ReactElement } from "react";
import { Button, Group, SimpleGrid, Stack, Text, Badge } from "@mantine/core";
import type { ServerIniSnapshot, ServerProfile, ServerRuntimeInfo } from "@shared/types";
import { resolveServerRuntime } from "../../createClusterModel";
import { templateApplyIneligibilityReason } from "../../templateApplyModel";
import { MAP_TRIBUTE_KEYS, readMapTributeValues, readTributeValues, type MapTributeKey } from "../../tributeModel";

interface Props {
  members: ServerProfile[];
  statuses: Map<string, ServerRuntimeInfo>;
  snapshots: Map<string, ServerIniSnapshot>;
  onEdit: (serverId: string) => void;
}

const LABELS: Record<MapTributeKey, string> = {
  PreventUploadItems: "Prevent item uploads",
  PreventDownloadItems: "Prevent item downloads",
  PreventUploadDinos: "Prevent creature uploads",
  PreventDownloadDinos: "Prevent creature downloads",
  PreventUploadSurvivors: "Prevent survivor uploads",
  PreventDownloadSurvivors: "Prevent survivor downloads",
  noTributeDownloads: "Prevent all Cross-ARK downloads",
  CrossARKAllowForeignDinoDownloads: "Allow non-native creature downloads (Aberration)",
};

function formValues(snapshot: ServerIniSnapshot | undefined): Record<MapTributeKey, boolean> {
  return readMapTributeValues(readTributeValues(snapshot?.payload.gameUserSettings ?? ""));
}

function hasChanges(values: Record<MapTributeKey, boolean>): boolean {
  return MAP_TRIBUTE_KEYS.some((key) => values[key]);
}

export function MapTributeSummary(props: Props): ReactElement {
  const firstMember = props.members[0];
  const firstSnapshot = firstMember ? props.snapshots.get(firstMember.id) : undefined;
  const values = formValues(firstSnapshot);
  const firstServer = firstMember ?? props.members[0];
  const runtime = firstServer ? resolveServerRuntime(props.statuses, firstServer.id) : null;
  const busyReason = runtime === null ? "Select a cluster member" : templateApplyIneligibilityReason(runtime);

  return (
    <Stack gap="xs">
      <Group justify="space-between" align="flex-start" wrap="wrap">
        <div>
          <Text fw={600} size="sm">
            This map only
          </Text>
          <Text size="xs" c="dimmed">
            These controls may intentionally differ by map. They are never part of the cluster drift check or
            cluster-wide apply.
          </Text>
        </div>
        <Button variant="default" disabled={busyReason !== null} onClick={() => props.onEdit(firstServer?.id ?? "")}>
          Edit settings for this map
        </Button>
      </Group>

      <Text size="xs" c={busyReason === null ? "dimmed" : "attention"}>
        {busyReason === null
          ? `Selected: ${firstServer?.name ?? "—"} · Status: ${runtime?.status ?? "unknown"}`
          : `Selected: ${firstServer?.name ?? "—"} · ${busyReason}`}
      </Text>

      {hasChanges(values) && (
        <Badge variant="light" color="attention">
          {MAP_TRIBUTE_KEYS.filter((k) => values[k]).length} override(s) active
        </Badge>
      )}

      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
        {MAP_TRIBUTE_KEYS.map((key) => (
          <span key={key} style={{ fontSize: "var(--mantine-font-size-xs)" }}>
            <span style={{ fontWeight: 500 }}>{LABELS[key]}: </span>
            {values[key] ? "Enabled" : "Disabled"}
          </span>
        ))}
      </SimpleGrid>

      <Text size="xs" c="dimmed">
        Unchecked, missing keys use the catalog's False default and are not written unless you change them. Edits apply
        to the selected stopped server only via the existing INI backup/save path.
      </Text>
    </Stack>
  );
}
