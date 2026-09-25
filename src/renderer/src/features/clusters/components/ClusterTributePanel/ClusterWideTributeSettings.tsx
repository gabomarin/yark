import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { Alert, Badge, Button, Group, NumberInput, Stack, Table, Text } from "@mantine/core";
import type {
  ClusterIniTemplateFileSelection,
  ServerIniSnapshot,
  ServerProfile,
  ServerRuntimeInfo,
} from "@shared/types";
import { AppPanelModal } from "@ui/AppPanelModal/AppPanelModal";
import { resolveServerRuntime } from "../../createClusterModel";
import { templateApplyIneligibilityReason } from "../../templateApplyModel";
import {
  CLUSTER_WIDE_TRIBUTE_KEYS,
  MAX_TRIBUTE_EXPIRATION_SECONDS,
  TRIBUTE_EXPIRATION_KEYS,
  TRIBUTE_SLOT_KEYS,
  formatTributeExpiration,
  readTributeValues,
  summarizeClusterWideValues,
  tributeSettingMeta,
  validateClusterWideValues,
  withClusterWideTributeValues,
  type ClusterWideTributeKey,
  type ClusterWideTributeValues,
} from "../../tributeModel";

interface Props {
  clusterId: string;
  members: ServerProfile[];
  statuses: Map<string, ServerRuntimeInfo>;
  snapshots: Map<string, ServerIniSnapshot>;
  onApplied: () => void;
}

type FormValues = Record<ClusterWideTributeKey, string>;

const GUS_ONLY: ClusterIniTemplateFileSelection = { gameUserSettings: true, game: false };

const SETTING_LABELS: Record<ClusterWideTributeKey, string> = {
  TributeItemExpirationSeconds: "Items expire after",
  TributeDinoExpirationSeconds: "Creatures expire after",
  TributeCharacterExpirationSeconds: "Survivors expire after",
  MaxTributeItems: "Item upload slots",
  MaxTributeDinos: "Creature upload slots",
  MaxTributeCharacters: "Survivor upload slots",
};

function initialFormValues(snapshots: Map<string, ServerIniSnapshot>): FormValues {
  const first = snapshots.values().next().value as ServerIniSnapshot | undefined;
  const actual = first === undefined ? null : readTributeValues(first.payload.gameUserSettings);
  return Object.fromEntries(
    CLUSTER_WIDE_TRIBUTE_KEYS.map((key) => [key, actual?.[key] ?? tributeSettingMeta(key).defaultValue]),
  ) as FormValues;
}

function numericFormValues(values: FormValues): ClusterWideTributeValues | null {
  if (CLUSTER_WIDE_TRIBUTE_KEYS.some((key) => values[key].trim() === "" || !Number.isFinite(Number(values[key])))) {
    return null;
  }
  return Object.fromEntries(
    CLUSTER_WIDE_TRIBUTE_KEYS.map((key) => [key, Number(values[key])]),
  ) as ClusterWideTributeValues;
}

function displayValue(key: ClusterWideTributeKey, value: string | null): string {
  if (value === null) return "Missing";
  if (key.startsWith("Tribute")) return formatTributeExpiration(value, tributeSettingMeta(key).defaultValue);
  return value;
}

export function ClusterWideTributeSettings(props: Props): ReactElement {
  const [form, setForm] = useState<FormValues>(() => initialFormValues(props.snapshots));
  const [formInitialized, setFormInitialized] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!formInitialized && props.snapshots.size > 0) {
      setForm(initialFormValues(props.snapshots));
      setFormInitialized(true);
    }
  }, [formInitialized, props.snapshots]);

  const memberValues = props.members.map((member) => {
    const snapshot = props.snapshots.get(member.id);
    return snapshot === undefined ? null : readTributeValues(snapshot.payload.gameUserSettings);
  });
  const status = summarizeClusterWideValues(memberValues.flatMap((values) => (values === null ? [] : [values])));
  const eligible = props.members.filter(
    (member) => templateApplyIneligibilityReason(resolveServerRuntime(props.statuses, member.id)) === null,
  );
  const skipped = props.members.filter((member) => !eligible.some((candidate) => candidate.id === member.id));
  const parsedValues = numericFormValues(form);
  const validationError =
    parsedValues === null ? "Enter a value for each setting." : validateClusterWideValues(parsedValues);

  const updateForm = (key: ClusterWideTributeKey, value: string | number): void => {
    setForm((current) => ({ ...current, [key]: String(value) }));
    setError(null);
    setNotice(null);
  };

  const apply = async (): Promise<void> => {
    if (parsedValues === null || validationError !== null || eligible.length === 0) return;
    setApplying(true);
    setError(null);
    setNotice(null);
    let templateSaved = false;
    const failures: string[] = [];
    try {
      const existing = await window.api.getClusterIniTemplate(props.clusterId);
      if (!existing.ok) throw new Error(existing.error ?? "Could not load the current cluster template");
      const payload = withClusterWideTributeValues(
        existing.data?.payload ?? { gameUserSettings: "", game: "" },
        parsedValues,
      );
      const preview = await window.api.previewClusterIniTemplate(props.clusterId, payload);
      if (!preview.ok) throw new Error(preview.error ?? "Could not preview the cluster template");
      if (!preview.data.valid) throw new Error(preview.data.issues.map((issue) => issue.message).join("; "));
      const saved = await window.api.saveClusterIniTemplate(props.clusterId, payload);
      if (!saved.ok) throw new Error(saved.error ?? "Could not save the cluster template");
      templateSaved = true;

      for (const member of eligible) {
        const result = await window.api.restoreClusterIniFromTemplate(props.clusterId, member.id, GUS_ONLY);
        if (!result.ok) failures.push(`${member.name}: ${result.error ?? "restore failed"}`);
      }
      if (failures.length > 0) {
        setError(
          `Template saved. Updated ${eligible.length - failures.length} of ${eligible.length} stopped members. ${failures.join("; ")}`,
        );
      } else {
        setNotice(
          `Saved cluster-wide values and updated ${eligible.length} stopped member${eligible.length === 1 ? "" : "s"}.`,
        );
      }
      setReviewOpen(false);
    } catch (cause) {
      setError(
        templateSaved
          ? `Template saved, but member apply stopped: ${cause instanceof Error ? cause.message : String(cause)}`
          : cause instanceof Error
            ? cause.message
            : String(cause),
      );
    } finally {
      setApplying(false);
      if (templateSaved) props.onApplied();
    }
  };

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
      </Group>

      {error !== null && (
        <Alert color="red" title="Tribute settings need attention">
          {error}
        </Alert>
      )}
      {notice !== null && <Alert color="ok">{notice}</Alert>}

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

      <Text size="xs" c="dimmed">
        A mismatch or a missing timer is shown per member above. Missing keys use ASA/catalog defaults; YARK does not
        assume those values are saved in the file.
      </Text>

      <Stack gap="xs">
        <Text fw={600} size="sm">
          Set values for the cluster
        </Text>
        <Text size="xs" c="dimmed">
          Inputs start from the first member's saved values; missing keys use the catalog defaults shown above.
        </Text>
        <Group align="flex-start" grow>
          {TRIBUTE_EXPIRATION_KEYS.map((key) => (
            <NumberInput
              key={key}
              label={`${SETTING_LABELS[key]} (hours)`}
              value={form[key] === "" ? "" : Number(form[key]) / 3600}
              min={0}
              max={MAX_TRIBUTE_EXPIRATION_SECONDS / 3600}
              decimalScale={2}
              step={1}
              description={`${tributeSettingMeta(key).description} 0 uses the game default.`}
              onChange={(value) => updateForm(key, value === "" ? "" : Math.round(Number(value) * 3600))}
            />
          ))}
        </Group>
        <Group align="flex-start" grow>
          {TRIBUTE_SLOT_KEYS.map((key) => (
            <NumberInput
              key={key}
              label={SETTING_LABELS[key]}
              value={form[key]}
              min={Number(tributeSettingMeta(key).defaultValue)}
              step={1}
              description={tributeSettingMeta(key).description}
              onChange={(value) => updateForm(key, value === "" ? "" : String(value))}
            />
          ))}
        </Group>
        {validationError !== null && (
          <Text size="xs" c="red">
            {validationError}
          </Text>
        )}
        <Group justify="space-between" align="center" wrap="wrap">
          <Text size="xs" c="dimmed">
            Only stopped members are eligible. Running members are identified and skipped before confirmation.
          </Text>
          <Button disabled={validationError !== null || eligible.length === 0} onClick={() => setReviewOpen(true)}>
            Review & apply to {eligible.length} stopped member{eligible.length === 1 ? "" : "s"}
          </Button>
        </Group>
      </Stack>

      <AppPanelModal
        opened={reviewOpen}
        onClose={() => {
          if (!applying) setReviewOpen(false);
        }}
        title="Apply cluster-wide tribute settings"
        size="md"
        closeOnClickOutside={!applying}
        closeOnEscape={!applying}
        withCloseButton={!applying}
        footerAlign="between"
        footer={
          <>
            <Button variant="default" disabled={applying} onClick={() => setReviewOpen(false)}>
              Cancel
            </Button>
            <Button loading={applying} onClick={() => void apply()}>
              Save template & restore
            </Button>
          </>
        }
      >
        <Stack gap="sm">
          <Alert color="attention" title="Cross-ARK data safety">
            Different expiration timers can cause stored ARK Data to be deleted when a player opens tribute on a map
            with a shorter timer. Expiration is limited to one year.
          </Alert>
          <Text size="sm">
            The cluster INI template will be updated, then its GameUserSettings.ini settings will be restored to these
            stopped members:
          </Text>
          {eligible.map((member) => (
            <Text key={member.id} size="sm">
              • {member.name}
            </Text>
          ))}
          <Stack gap={2}>
            <Text fw={600} size="sm">
              Values to apply
            </Text>
            {parsedValues !== null &&
              CLUSTER_WIDE_TRIBUTE_KEYS.map((key) => (
                <Text key={key} size="sm">
                  {SETTING_LABELS[key]}:{" "}
                  {key.startsWith("Tribute")
                    ? formatTributeExpiration(String(parsedValues[key]), tributeSettingMeta(key).defaultValue)
                    : parsedValues[key]}
                </Text>
              ))}
          </Stack>
          {skipped.length > 0 && (
            <Stack gap="xs">
              <Text fw={600} size="sm">
                Skipped before confirmation
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
            Each restore uses the existing backup, composition, and stopped-server checks. Unrelated INI settings and
            profile-owned keys are preserved.
          </Text>
        </Stack>
      </AppPanelModal>
    </Stack>
  );
}
