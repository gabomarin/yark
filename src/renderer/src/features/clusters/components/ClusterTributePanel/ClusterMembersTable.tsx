import type { ReactElement } from "react";
import { CopySimple, DownloadSimple, UploadSimple, WarningCircle, X } from "@phosphor-icons/react";
import { ActionIcon, Alert, Group, Stack, Table, Text, Tooltip, UnstyledButton } from "@mantine/core";
import { formatMapDisplayName } from "@shared/asa/map-identity";
import type { ServerIniSnapshot, ServerProfile, ServerRuntimeInfo } from "@shared/types";
import { MapArtThumb } from "@ui/MapArtThumb/MapArtThumb";
import { ServerRuntimeStatusBadge } from "@ui/ServerRuntimeStatusBadge/ServerRuntimeStatusBadge";
import { resolveServerRuntime } from "../../createClusterModel";
import { removeIneligibilityReason } from "../../membershipModel";
import { templateApplyIneligibilityReason } from "../../templateApplyModel";
import {
  CLUSTER_WIDE_TRIBUTE_KEYS,
  formatTributeExpiration,
  readTributeValues,
  summarizeClusterWideValues,
  clusterWideTributeValuesEqual,
  normalizeClusterWideTributeValue,
  tributeSettingMeta,
  TRIBUTE_EXPIRATION_KEYS,
  type ClusterWideTributeKey,
} from "../../tributeModel";
import classes from "./ClusterMembersTable.module.css";

interface Props {
  clusterId: string;
  members: ServerProfile[];
  statuses: Map<string, ServerRuntimeInfo>;
  snapshots: Map<string, ServerIniSnapshot>;
  templateValues: Partial<Record<ClusterWideTributeKey, string | null>>;
  hasTemplate: boolean;
  applyingTransferServerId: string | null;
  transferApplyError: string | null;
  onOpenServer: (serverId: string) => void;
  onPromoteToTemplate: (serverId: string) => void;
  onApplyIniTemplate: (serverId: string) => void;
  onApplyTransferSettings: (serverId: string) => void;
  onRemoveServer: (serverId: string) => void;
}

const SETTING_LABELS: Record<ClusterWideTributeKey, string> = {
  TributeItemExpirationSeconds: "Items expire after",
  TributeDinoExpirationSeconds: "Creatures expire after",
  TributeCharacterExpirationSeconds: "Survivors expire after",
  MaxTributeItems: "Item upload slots",
  MaxTributeDinos: "Creature upload slots",
  MaxTributeCharacters: "Survivor upload slots",
};

function displayValue(key: ClusterWideTributeKey, value: string | null): string {
  if (value === null) return "Missing";
  const expirationKey = TRIBUTE_EXPIRATION_KEYS.find((candidate) => candidate === key);
  if (expirationKey !== undefined) {
    return formatTributeExpiration(value, tributeSettingMeta(expirationKey).defaultValue, expirationKey);
  }
  return value;
}

function differsFromTemplate(
  values: ReturnType<typeof readTributeValues> | null,
  templateValues: Props["templateValues"],
): boolean {
  return CLUSTER_WIDE_TRIBUTE_KEYS.some((key) => {
    const expected = templateValues[key];
    if (expected === null || expected === undefined) return false;
    const actual = values?.[key];
    return !clusterWideTributeValuesEqual(key, actual, expected);
  });
}

function differsFromClusterExpected(
  key: ClusterWideTributeKey,
  value: string | null,
  expected: string | null | undefined,
  status: "missing" | "matching" | "different",
  firstMemberValue: string | undefined,
): boolean {
  if (expected !== null && expected !== undefined) {
    return !clusterWideTributeValuesEqual(key, value, expected);
  }
  if (value === null) return status === "missing";
  if (normalizeClusterWideTributeValue(key, value) === null) return true;
  return status === "different" && firstMemberValue !== undefined
    ? !clusterWideTributeValuesEqual(key, value, firstMemberValue)
    : false;
}

function TableAction(props: {
  label: string;
  tooltip: string;
  icon: ReactElement;
  disabled?: boolean;
  loading?: boolean;
  color?: "gray" | "blue" | "red";
  onClick: () => void;
}): ReactElement {
  return (
    <Tooltip label={props.tooltip} withArrow>
      <span>
        <ActionIcon
          size="sm"
          variant="subtle"
          color={props.color ?? "gray"}
          aria-label={props.label}
          disabled={props.disabled}
          loading={props.loading}
          onClick={props.onClick}
        >
          {props.icon}
        </ActionIcon>
      </span>
    </Tooltip>
  );
}

export function ClusterMembersTable(props: Props): ReactElement {
  const memberValues = props.members.map((member) => {
    const snapshot = props.snapshots.get(member.id);
    return snapshot === undefined ? null : readTributeValues(snapshot.payload.gameUserSettings);
  });
  const memberStatus = summarizeClusterWideValues(memberValues.map((values) => values ?? {}));
  const templateDriftKeys = CLUSTER_WIDE_TRIBUTE_KEYS.filter((key) => {
    const expected = props.templateValues[key];
    if (expected === null || expected === undefined) return false;
    const normalizedExpected = String(Number(expected));
    return memberValues.some((values) => {
      const value = values?.[key];
      return value === null || value === undefined || String(Number(value)) !== normalizedExpected;
    });
  });
  const hasTransferTemplate = CLUSTER_WIDE_TRIBUTE_KEYS.some((key) => props.templateValues[key] != null);

  return (
    <Stack gap="xs">
      {props.transferApplyError !== null && (
        <Alert color="red" title="Could not apply cluster transfer settings">
          {props.transferApplyError}
        </Alert>
      )}
      <Table.ScrollContainer minWidth={1180} type="native" className={classes.scrollContainer}>
        <Table
          className={classes.membersTable}
          withTableBorder
          highlightOnHover
          stickyHeader
          verticalSpacing="sm"
          horizontalSpacing="sm"
        >
          <Table.Thead>
            <Table.Tr>
              <Table.Th className={classes.memberHeader}>Cluster member</Table.Th>
              {CLUSTER_WIDE_TRIBUTE_KEYS.map((key) => {
                const hasIssue = memberStatus[key] !== "matching" || templateDriftKeys.includes(key);
                const tooltip = [
                  memberStatus[key] === "different" ? "Values differ between members." : null,
                  memberStatus[key] === "missing" ? "Value missing on one or more members." : null,
                  templateDriftKeys.includes(key) ? "One or more members differ from the saved template." : null,
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <Table.Th key={key}>
                    <Group gap={4} wrap="nowrap">
                      <Text size="xs">{SETTING_LABELS[key]}</Text>
                      {hasIssue && (
                        <Tooltip label={tooltip} multiline maw={260} withArrow>
                          <span role="img" tabIndex={0} aria-label={`${SETTING_LABELS[key]} has inconsistent values`}>
                            <WarningCircle size={15} color="var(--mantine-color-attention-6)" aria-hidden="true" />
                          </span>
                        </Tooltip>
                      )}
                    </Group>
                  </Table.Th>
                );
              })}
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {props.members.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={CLUSTER_WIDE_TRIBUTE_KEYS.length + 2}>
                  <Text size="sm" c="dimmed">
                    Server profiles could not be resolved.
                  </Text>
                </Table.Td>
              </Table.Tr>
            ) : (
              props.members.map((member, index) => {
                const values = memberValues[index];
                const runtime = resolveServerRuntime(props.statuses, member.id);
                const removeReason = removeIneligibilityReason(runtime);
                const templateApplyReason = templateApplyIneligibilityReason(runtime);
                const memberDiffers = differsFromTemplate(values ?? null, props.templateValues);
                const firstValueFor = (key: ClusterWideTributeKey): string | undefined =>
                  memberValues.find((memberValuesForKey) => {
                    const candidate = memberValuesForKey?.[key];
                    return normalizeClusterWideTributeValue(key, candidate) !== null;
                  })?.[key] ?? undefined;

                return (
                  <Table.Tr key={`${props.clusterId}-${member.id}`}>
                    <Table.Td className={classes.memberCell}>
                      <Group gap="xs" wrap="nowrap" align="center">
                        <MapArtThumb mapId={member.map} size="sm" decorative />
                        <Stack gap={2} className={classes.memberIdentity}>
                          <UnstyledButton
                            className={classes.memberLink}
                            aria-label={`Open ${member.name}`}
                            onClick={() => props.onOpenServer(member.id)}
                          >
                            <Text size="sm" fw={600} truncate>
                              {member.name}
                            </Text>
                          </UnstyledButton>
                          <Group gap="xs" wrap="nowrap">
                            <Text size="xs" c="dimmed" truncate>
                              {formatMapDisplayName(member.map)}
                            </Text>
                            {!member.enabled && (
                              <Text size="xs" fw={600} c="dimmed">
                                Inactive
                              </Text>
                            )}
                            <ServerRuntimeStatusBadge status={runtime.status} size="xs" />
                          </Group>
                        </Stack>
                      </Group>
                    </Table.Td>
                    {CLUSTER_WIDE_TRIBUTE_KEYS.map((key) => {
                      const value = values?.[key] ?? null;
                      const expected = props.templateValues[key];
                      const firstValue = firstValueFor(key);
                      const differsFromExpected = differsFromClusterExpected(
                        key,
                        value,
                        expected,
                        memberStatus[key],
                        firstValue,
                      );
                      return (
                        <Table.Td key={key} className={differsFromExpected ? classes.differentCell : undefined}>
                          <Text size="sm">{displayValue(key, value)}</Text>
                          {value === null && (
                            <Text size="xs" c="dimmed">
                              Catalog default: {tributeSettingMeta(key).defaultValue}
                            </Text>
                          )}
                        </Table.Td>
                      );
                    })}
                    <Table.Td>
                      <Group gap={2} wrap="nowrap">
                        <TableAction
                          label={`Promote ${member.name} to template`}
                          tooltip={templateApplyReason ?? "Promote to template"}
                          icon={<UploadSimple size={15} weight="bold" />}
                          color="blue"
                          disabled={templateApplyReason !== null}
                          onClick={() => props.onPromoteToTemplate(member.id)}
                        />
                        <TableAction
                          label={`Apply INI template to ${member.name}`}
                          tooltip={
                            !props.hasTemplate
                              ? "Create an INI template first"
                              : (templateApplyReason ??
                                "Apply the cluster INI template to this stopped server (with backup)")
                          }
                          icon={<DownloadSimple size={15} weight="bold" />}
                          color="blue"
                          disabled={!props.hasTemplate || templateApplyReason !== null}
                          onClick={() => props.onApplyIniTemplate(member.id)}
                        />
                        <TableAction
                          label={`Apply cluster transfer settings to ${member.name}`}
                          tooltip={
                            !hasTransferTemplate
                              ? "Save cluster transfer settings first"
                              : (templateApplyReason ??
                                (memberDiffers
                                  ? "Apply the six cluster transfer settings to this server"
                                  : "This server already matches the cluster transfer settings"))
                          }
                          icon={<CopySimple size={15} weight="bold" />}
                          color="blue"
                          disabled={
                            !hasTransferTemplate ||
                            templateApplyReason !== null ||
                            props.applyingTransferServerId !== null ||
                            !memberDiffers
                          }
                          loading={props.applyingTransferServerId === member.id}
                          onClick={() => props.onApplyTransferSettings(member.id)}
                        />
                        <TableAction
                          label={`Remove ${member.name}`}
                          tooltip={removeReason ?? `Remove ${member.name} from this cluster`}
                          icon={<X size={15} weight="bold" />}
                          color="red"
                          disabled={removeReason !== null}
                          onClick={() => props.onRemoveServer(member.id)}
                        />
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                );
              })
            )}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Stack>
  );
}
