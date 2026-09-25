import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { Alert, Button, Group, NumberInput, Stack, Text } from "@mantine/core";
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
  tributeSettingMeta,
  validateClusterWideValues,
  withClusterWideTributeValues,
  type ClusterWideTributeKey,
  type ClusterWideTributeValues,
} from "../../tributeModel";

interface Props {
  opened: boolean;
  clusterId: string;
  members: ServerProfile[];
  statuses: Map<string, ServerRuntimeInfo>;
  snapshots: Map<string, ServerIniSnapshot>;
  onClose: () => void;
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

export function ClusterWideEditor(props: Props): ReactElement {
  const [form, setForm] = useState<FormValues>(() => initialFormValues(props.snapshots));
  const [formInitialized, setFormInitialized] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!formInitialized && props.snapshots.size > 0) {
      setForm(initialFormValues(props.snapshots));
      setFormInitialized(true);
    }
  }, [formInitialized, props.snapshots]);

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
      if (templateSaved) {
        props.onApplied();
        props.onClose();
      }
    }
  };

  return (
    <AppPanelModal
      opened={props.opened}
      onClose={() => {
        if (!applying) props.onClose();
      }}
      title="Edit cluster-wide tribute settings"
      size="md"
      closeOnClickOutside={!applying}
      closeOnEscape={!applying}
      withCloseButton={!applying}
      footerAlign="between"
      footer={
        <>
          <Button variant="default" disabled={applying} onClick={props.onClose}>
            Cancel
          </Button>
          <Button
            loading={applying}
            disabled={validationError !== null || eligible.length === 0}
            onClick={() => void apply()}
          >
            Propagate to {eligible.length} stopped member{eligible.length === 1 ? "" : "s"}
          </Button>
        </>
      }
    >
      <Stack gap="xs">
        {error !== null && (
          <Alert color="red" title="Tribute settings need attention">
            {error}
          </Alert>
        )}
        {notice !== null && <Alert color="ok">{notice}</Alert>}

        <Alert color="attention" title="Cross-ARK data safety">
          Different expiration timers can cause stored ARK Data to be deleted when a player opens tribute on a map with
          a shorter timer. Expiration is limited to one year.
        </Alert>

        <Stack gap="xs">
          <Text fw={600} size="sm">
            Set values for the cluster
          </Text>
          <Text size="xs" c="dimmed">
            Saving propagates automatically: the cluster template is updated, then restored to every stopped member
            below.
          </Text>
          <Text fw={600} size="sm">
            Expiration timers
          </Text>
          <Text size="xs" c="dimmed">
            Mismatched timers can delete ARK Data. Limited to one year.
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
          <Text fw={600} size="sm">
            Upload slots
          </Text>
          <Text size="xs" c="dimmed">
            Values below the catalog defaults are rejected; raising them can corrupt cluster data.
          </Text>
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
        </Stack>

        <Text size="sm">Saving propagates to these stopped members:</Text>
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
  );
}
