import type { ReactElement } from "react";
import { Button, Group, Stack, Table, Text, Badge } from "@mantine/core";
import type { ServerIniSnapshot, ServerProfile, ServerRuntimeInfo } from "@shared/types";
import { resolveServerRuntime } from "../../createClusterModel";
import { templateApplyIneligibilityReason } from "../../templateApplyModel";
import {
  CLUSTER_WIDE_TRIBUTE_KEYS,
  formatTributeExpiration,
  readTributeValues,
  summarizeClusterWideValues,
  tributeSettingMeta,
  type ClusterWideTributeKey,
} from "../../tributeModel";

interface Props {
  clusterId: string;
  members: ServerProfile[];
  statuses: Map<string, ServerRuntimeInfo>;
  snapshots: Map<string, ServerIniSnapshot>;
  onEdit: () => void;
}

const SETTING_LABELS: Record<ClusterWideTributeKey, string> = {
  TributeItemExpirationSeconds: "Items expire after",
  TributeDinoExpirationSeconds: "Creatures expire after",
  TributeCharacterExpirationSeconds: "Survivors expire after",
  MaxTributeItems: "Item upload slots",
  MaxTributeDinos: "Creature upload slots",
  MaxTributeCharacters: "Survivor upload slots",
};

function hasDifferences(status: Record<ClusterWideTributeKey, "missing" | "matching" | "different">): boolean {
  return CLUSTER_WIDE_TRIBUTE_KEYS.some((key) => status[key] !== "matching");
}

function displayValue(key: ClusterWideTributeKey, value: string | null): string {
  if (value === null) return "Missing";
  if (key.startsWith("Tribute")) return formatTributeExpiration(value, tributeSettingMeta(key).defaultValue);
  return value;
}

export function ClusterWideSummary(props: Props): ReactElement {
  const memberValues = props.members.map((member) => {
    const snapshot = props.snapshots.get(member.id);
    return snapshot === undefined ? null : readTributeValues(snapshot.payload.gameUserSettings);
  });
  const status = summarizeClusterWideValues(memberValues.flatMap((values) => (values === null ? [] : [values])));
  const eligible = props.members.filter(
    (member) => templateApplyIneligibilityReason(resolveServerRuntime(props.statuses, member.id)) === null,
  );
  const skipped = props.members.filter((member) => !eligible.some((candidate) => candidate.id === member.id));
  const hasIssues = hasDifferences(status);

  return (
    <Stack gap="xs">
      <Group justify="space-between" align="flex-start" wrap="wrap">
        <div>
          <Text fw={600} size="sm">
            Cluster-wide settings
          </Text>
          <Text size="xs" c="dimmed">
            Expiration timers and slot caps are aligned by restoring the GUS template.
          </Text>
        </div>
        <Button variant="default" onClick={props.onEdit}>
          Edit cluster settings
        </Button>
      </Group>

      {hasIssues && (
        <Text size="xs" c="attention">
          {CLUSTER_WIDE_TRIBUTE_KEYS.filter((k) => status[k] === "different").length} difference(s){", "}
          {CLUSTER_WIDE_TRIBUTE_KEYS.filter((k) => status[k] === "missing").length} member(s) missing values
        </Text>
      )}

      <Table.ScrollContainer minWidth={900} type="native">
        <Table withTableBorder withColumnBorders verticalSpacing="xs" horizontalSpacing="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Cluster member</Table.Th>
              {CLUSTER_WIDE_TRIBUTE_KEYS.map((key) => (
                <Table.Th key={key}>
                  <Stack gap={4}>
                    <Text size="xs">{SETTING_LABELS[key]}</Text>
                    <Badge
                      variant="light"
                      color={status[key] === "matching" ? "ok" : status[key] === "different" ? "attention" : "gray"}
                    >
                      {status[key]}
                    </Badge>
                  </Stack>
                </Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {props.members.map((member, index) => {
              const values = memberValues[index];
              return (
                <Table.Tr key={member.id}>
                  <Table.Th scope="row">
                    <Stack gap={2}>
                      <Text size="sm">{member.name}</Text>
                      <Text size="xs" c="dimmed">
                        {resolveServerRuntime(props.statuses, member.id).status}
                      </Text>
                    </Stack>
                  </Table.Th>
                  {CLUSTER_WIDE_TRIBUTE_KEYS.map((key) => {
                    const value = values?.[key] ?? null;
                    return (
                      <Table.Td key={key}>
                        <Text size="xs">{displayValue(key, value)}</Text>
                        {value === null && (
                          <Text size="xs" c="dimmed">
                            Catalog default: {tributeSettingMeta(key).defaultValue}
                          </Text>
                        )}
                      </Table.Td>
                    );
                  })}
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      {skipped.length > 0 && (
        <Stack gap="xs">
          <Text fw={600} size="sm">
            Skipped if applied now
          </Text>
          {skipped.map((member) => {
            const reason = templateApplyIneligibilityReason(resolveServerRuntime(props.statuses, member.id));
            return (
              <Text key={member.id} size="sm">
                {member.name}: {reason ?? "not eligible"}
              </Text>
            );
          })}
        </Stack>
      )}

      <Text size="xs" c="dimmed">
        Missing keys use ASA/catalog defaults; YARK does not assume those values are saved in the file. Edits use the
        existing template compose/restore path with backups and profile-owned key preservation.
      </Text>
    </Stack>
  );
}
