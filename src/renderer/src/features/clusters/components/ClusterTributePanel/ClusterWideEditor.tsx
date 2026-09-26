import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import { CaretDown, Info } from "@phosphor-icons/react";
import { ActionIcon, Alert, Button, Group, Menu, NumberInput, Stack, Text, Tooltip } from "@mantine/core";
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
  formatTributeDuration,
  readTributeValues,
  tributeSettingMeta,
  validateClusterWideValue,
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

function SettingInfoLabel(props: { inputId: string; settingKey: ClusterWideTributeKey; label: string }): ReactElement {
  return (
    <Group gap={4} wrap="nowrap">
      <Text component="label" htmlFor={props.inputId} size="sm">
        {props.label}
      </Text>
      <Tooltip label={tributeSettingMeta(props.settingKey).description} multiline maw={420} withArrow openDelay={350}>
        <ActionIcon variant="subtle" color="gray" size="sm" aria-label={`More information about ${props.label}`}>
          <Info size={14} weight="bold" />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}

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
  const formSource = useRef<{ clusterId: string; snapshots: Map<string, ServerIniSnapshot> } | null>(null);
  const formDirty = useRef(false);
  const [saving, setSaving] = useState(false);
  const [showSkipped, setShowSkipped] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!props.opened) {
      formSource.current = null;
      formDirty.current = false;
      return;
    }
    if (saving || props.snapshots.size === 0) return;
    if (formSource.current?.clusterId === props.clusterId && formSource.current.snapshots === props.snapshots) return;
    if (formSource.current?.clusterId === props.clusterId && formDirty.current) {
      formSource.current = { clusterId: props.clusterId, snapshots: props.snapshots };
      return;
    }
    setForm(initialFormValues(props.snapshots));
    setError(null);
    setShowSkipped(false);
    formDirty.current = false;
    formSource.current = { clusterId: props.clusterId, snapshots: props.snapshots };
  }, [props.clusterId, props.opened, props.snapshots, saving]);

  const eligible = props.members.filter(
    (member) => templateApplyIneligibilityReason(resolveServerRuntime(props.statuses, member.id)) === null,
  );
  const skipped = props.members.filter((member) => !eligible.some((candidate) => candidate.id === member.id));
  const parsedValues = numericFormValues(form);
  const settingError = (key: ClusterWideTributeKey): string | undefined => {
    if (form[key].trim() === "" || !Number.isFinite(Number(form[key]))) return "Enter a number.";
    return validateClusterWideValue(key, Number(form[key])) ?? undefined;
  };
  const validationError =
    parsedValues === null ? "Enter a value for each setting." : validateClusterWideValues(parsedValues);

  const updateForm = (key: ClusterWideTributeKey, value: string | number): void => {
    formDirty.current = true;
    setForm((current) => ({ ...current, [key]: String(value) }));
    setError(null);
  };

  const save = async (applyToServers: boolean): Promise<void> => {
    if (parsedValues === null || validationError !== null || (applyToServers && eligible.length === 0)) return;
    setSaving(true);
    setError(null);
    let templateSaved = false;
    let closeAfterSave = true;
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

      if (applyToServers) {
        for (const member of eligible) {
          const result = await window.api.restoreClusterIniFromTemplate(props.clusterId, member.id, GUS_ONLY);
          if (!result.ok) failures.push(`${member.name}: ${result.error ?? "restore failed"}`);
        }
        if (failures.length > 0) {
          closeAfterSave = false;
          setError(
            `Template saved. Updated ${eligible.length - failures.length} of ${eligible.length} stopped members. ${failures.join("; ")}`,
          );
        }
      }
    } catch (cause) {
      closeAfterSave = !templateSaved;
      let message: string;
      if (templateSaved) {
        message = `Template saved, but member apply stopped: ${cause instanceof Error ? cause.message : String(cause)}`;
      } else if (cause instanceof Error) {
        message = cause.message;
      } else {
        message = String(cause);
      }
      setError(message);
    } finally {
      setSaving(false);
      if (templateSaved) {
        props.onApplied();
        if (closeAfterSave) props.onClose();
      }
    }
  };

  return (
    <AppPanelModal
      opened={props.opened}
      onClose={() => {
        if (!saving) props.onClose();
      }}
      title="Edit cluster transfer settings"
      size="lg"
      closeOnClickOutside={!saving}
      closeOnEscape={!saving}
      withCloseButton={!saving}
      footerAlign="between"
      footer={
        <>
          <Button variant="default" disabled={saving} onClick={props.onClose}>
            Cancel
          </Button>
          <Button.Group>
            <Button loading={saving} disabled={validationError !== null} onClick={() => void save(false)}>
              Save
            </Button>
            <Menu shadow="md" withinPortal position="bottom-end">
              <Menu.Target>
                <Button px="xs" aria-label="More save options" disabled={saving || validationError !== null}>
                  <CaretDown size={14} />
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item disabled={eligible.length === 0} onClick={() => void save(true)}>
                  Save and apply to servers
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Button.Group>
        </>
      }
    >
      <Stack gap="xs">
        {error !== null && (
          <Alert color="red" title="Tribute settings need attention">
            {error}
          </Alert>
        )}
        <Alert color="attention" title="Avoid data loss">
          If servers use different expiration timers, stored ARK Data can be deleted when a player opens Tribute on a
          map with a shorter timer.
        </Alert>

        <Stack gap="xs">
          <Text fw={600} size="sm">
            Expiration
          </Text>
          <Text size="xs" c="dimmed">
            Enter whole values in seconds. Maximum: 1 year. For items and creatures, 0 uses the game default; for
            survivors, 0 means no expiration.
          </Text>
          <Group align="flex-start" grow>
            {TRIBUTE_EXPIRATION_KEYS.map((key) => {
              const inputId = `cluster-tribute-${key}`;
              return (
                <Stack key={key} gap={4}>
                  <SettingInfoLabel inputId={inputId} settingKey={key} label={`${SETTING_LABELS[key]} (seconds)`} />
                  <NumberInput
                    id={inputId}
                    value={form[key] === "" ? "" : Number(form[key])}
                    min={0}
                    max={MAX_TRIBUTE_EXPIRATION_SECONDS}
                    step={1}
                    error={settingError(key)}
                    onChange={(value) => updateForm(key, value)}
                  />
                  <Text size="xs" c="dimmed">
                    {form[key].trim() === ""
                      ? "Enter a value in seconds."
                      : `(${formatTributeDuration(Number(form[key]), key)})`}
                  </Text>
                </Stack>
              );
            })}
          </Group>
          <Text fw={600} size="sm">
            Upload slots
          </Text>
          <Text size="xs" c="dimmed">
            Values below each catalog default are rejected. Increasing upload limits may risk stored ARK Data; check
            each field’s info before changing it.
          </Text>
          <Group align="flex-start" grow>
            {TRIBUTE_SLOT_KEYS.map((key) => {
              const inputId = `cluster-tribute-${key}`;
              const meta = tributeSettingMeta(key);
              const input = meta.input.type === "number" || meta.input.type === "range" ? meta.input : null;
              return (
                <Stack key={key} gap={4}>
                  <SettingInfoLabel inputId={inputId} settingKey={key} label={SETTING_LABELS[key]} />
                  <NumberInput
                    id={inputId}
                    value={form[key]}
                    min={input?.min ?? Number(meta.defaultValue)}
                    max={input?.max}
                    step={input?.step ?? 1}
                    error={settingError(key)}
                    onChange={(value) => updateForm(key, value)}
                  />
                </Stack>
              );
            })}
          </Group>
          {validationError !== null && (
            <Text size="xs" c="red">
              Fix the highlighted values before saving.
            </Text>
          )}
        </Stack>

        <Text size="xs" c="dimmed">
          Save updates only the cluster template. Save and apply updates the template and applies these values to eligible
          stopped servers. Running or busy servers are skipped. YARK creates a backup before applying and preserves
          other INI settings, including profile-managed values.
        </Text>
        {skipped.length > 0 && (
          <Stack gap="xs">
            <Button
              variant="subtle"
              size="xs"
              w="fit-content"
              aria-expanded={showSkipped}
              onClick={() => setShowSkipped((open) => !open)}
            >
              {showSkipped ? "Hide" : "Show"} {skipped.length} skipped member{skipped.length === 1 ? "" : "s"}
            </Button>
            {showSkipped &&
              skipped.map((member) => {
                const reason = templateApplyIneligibilityReason(resolveServerRuntime(props.statuses, member.id));
                return (
                  <Text key={member.id} size="sm">
                    {member.name}: {reason ?? "not eligible"}
                  </Text>
                );
              })}
          </Stack>
        )}
      </Stack>
    </AppPanelModal>
  );
}
