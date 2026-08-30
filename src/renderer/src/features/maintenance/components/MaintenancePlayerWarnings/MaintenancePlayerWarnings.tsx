import { Group, Stack, Text, TextInput } from "@mantine/core";
import type { MaintenanceBroadcastPreset, MaintenanceJobWarnings } from "@shared/types";
import {
  MAINTENANCE_RESTART_PRESET_OFFSETS,
  MAINTENANCE_UPDATE_PRESET_OFFSETS,
} from "@shared/maintenance-policy";
import type { ReactElement } from "react";
import {
  CUSTOM_OFFSET_OPTIONS,
  PRESET_LABELS,
  previewWarningMessage,
} from "../../model/maintenancePanelModel";
import classes from "../../MaintenancePanel.module.css";

interface Props {
  kind: "restart" | "update";
  warnings: MaintenanceJobWarnings;
  disabled: boolean;
  onChange: (next: MaintenanceJobWarnings) => void;
}

/** Per-job Broadcast presets + template (MagicPath mock). */
export function MaintenancePlayerWarnings(props: Props): ReactElement {
  const table =
    props.kind === "restart"
      ? MAINTENANCE_RESTART_PRESET_OFFSETS
      : MAINTENANCE_UPDATE_PRESET_OFFSETS;
  const offsets =
    props.warnings.preset === "custom"
      ? props.warnings.customOffsets
      : table[props.warnings.preset];
  const previewTime = props.kind === "restart" ? "15 minutes" : "5 minutes";
  const standardHint =
    props.kind === "restart" ? "30 / 15 / 5 / 1 minute" : "15 / 5 / 1 minute";
  const preview = previewWarningMessage(props.warnings.template, previewTime);

  return (
    <Stack gap="xs">
      <div>
        <Text className={classes.fieldLabel}>Player warnings · how often</Text>
        <Text size="xs" c="dimmed" mt={2}>
          In-game Broadcast before this job. Separate from{" "}
          {props.kind === "restart" ? "auto-update" : "restart schedule"}.
        </Text>
      </div>
      <Group gap={6} wrap="wrap">
        {(Object.keys(PRESET_LABELS) as MaintenanceBroadcastPreset[]).map(
          (key) => {
            const active = props.warnings.preset === key;
            const hint =
              key === "standard" ? standardHint : PRESET_LABELS[key].hint;
            return (
              <button
                key={key}
                type="button"
                disabled={props.disabled}
                className={`${classes.presetChip}${active ? ` ${classes.presetChipActive}` : ""}`}
                onClick={() => {
                  if (key === "custom") {
                    props.onChange({ ...props.warnings, preset: "custom" });
                    return;
                  }
                  props.onChange({
                    preset: key,
                    customOffsets: [...table[key]],
                    template: props.warnings.template,
                  });
                }}
              >
                <span className={classes.presetTitle}>
                  {PRESET_LABELS[key].title}
                </span>
                <span className={classes.presetHint}>{hint}</span>
              </button>
            );
          },
        )}
      </Group>
      {props.warnings.preset === "custom" ? (
        <Group gap={4} wrap="wrap">
          {CUSTOM_OFFSET_OPTIONS.map((offset) => {
            const on = props.warnings.customOffsets.includes(offset);
            return (
              <button
                key={offset}
                type="button"
                disabled={props.disabled}
                className={`${classes.offsetChip}${on ? ` ${classes.offsetChipOn}` : ""}`}
                onClick={() => {
                  const customOffsets = on
                    ? props.warnings.customOffsets.filter((x) => x !== offset)
                    : [...props.warnings.customOffsets, offset];
                  props.onChange({
                    ...props.warnings,
                    preset: "custom",
                    customOffsets,
                  });
                }}
              >
                {offset}
              </button>
            );
          })}
        </Group>
      ) : (
        <Text size="xs" c="dimmed" className={classes.tabular}>
          Sends at: {offsets.join(" · ")}
        </Text>
      )}
      <TextInput
        size="xs"
        label="Warning message"
        description="Players see this in-game. Use {time} for the countdown."
        value={props.warnings.template}
        disabled={props.disabled}
        onChange={(e) => {
          props.onChange({
            ...props.warnings,
            template: e.currentTarget.value,
          });
        }}
      />
      <Text size="sm" fs="italic" c="dimmed" className={classes.preview}>
        Preview: “{preview}”
      </Text>
    </Stack>
  );
}
