import { Badge, Group, Stack, Switch, Text, TextInput } from "@mantine/core";
import type { MaintenanceJobWarnings } from "@shared/types";
import {
  MAINTENANCE_MANUAL_RESTART_PRESET_OFFSETS,
  MAINTENANCE_RESTART_PRESET_OFFSETS,
  MAINTENANCE_UPDATE_PRESET_OFFSETS,
} from "@shared/maintenance/maintenance-policy";
import type { ReactElement } from "react";
import {
  CUSTOM_OFFSET_OPTIONS,
  formatMaintenancePresetHint,
  PRESET_LABELS,
  WARNING_PRESET_ORDER,
  previewWarningMessage,
  toggleCustomWarningOffset,
  warningsForPreset,
} from "../../model/maintenancePanelModel";
import classes from "../../MaintenancePanel.module.css";

interface Props {
  kind: "restart" | "update" | "manual";
  warnings: MaintenanceJobWarnings;
  disabled: boolean;
  onChange: (next: MaintenanceJobWarnings) => void;
}

function OffsetBadges({ offsetLabels }: { offsetLabels: readonly string[] }): ReactElement {
  return (
    <div className={classes.sendsAtBlock}>
      <Text size="sm" fw={500} className={classes.sendsAtLabel}>
        Sends at
      </Text>
      <Group gap={6} wrap="wrap">
        {offsetLabels.map((offset) => (
          <Badge key={offset} variant="light" color="gray" className={classes.offsetBadge}>
            {offset}
          </Badge>
        ))}
      </Group>
    </div>
  );
}

/** Per-job ServerChat presets + template (MagicPath mock). */
export function MaintenancePlayerWarnings(props: Props): ReactElement {
  const table =
    props.kind === "restart"
      ? MAINTENANCE_RESTART_PRESET_OFFSETS
      : props.kind === "manual"
        ? MAINTENANCE_MANUAL_RESTART_PRESET_OFFSETS
        : MAINTENANCE_UPDATE_PRESET_OFFSETS;
  const offsets =
    props.warnings.preset === "custom"
      ? props.warnings.customOffsets
      : props.warnings.preset === "none"
        ? []
        : table[props.warnings.preset];
  const previewTime = props.kind === "manual" ? "5 minutes" : props.kind === "restart" ? "15 minutes" : "5 minutes";
  const preview = previewWarningMessage(props.warnings.template, previewTime);
  const warningsOff = props.warnings.preset === "none";
  const presetOrder = props.kind === "manual" ? (["quiet", "standard", "strict"] as const) : WARNING_PRESET_ORDER;

  return (
    <Stack gap="xs">
      <div>
        <Text className={classes.fieldLabel}>Player warnings · how often</Text>
        <Text size="xs" c="dimmed" mt={2}>
          In-game ServerChat before this job.
        </Text>
      </div>
      <Group gap={6} wrap="wrap">
        {presetOrder.map((key) => {
          const active = props.warnings.preset === key;
          return (
            <button
              key={key}
              type="button"
              disabled={props.disabled}
              className={`${classes.presetChip}${active ? ` ${classes.presetChipActive}` : ""}`}
              onClick={() => {
                props.onChange(warningsForPreset(props.kind, key, props.warnings));
              }}
            >
              <span className={classes.presetTitle}>{PRESET_LABELS[key].title}</span>
            </button>
          );
        })}
      </Group>
      {warningsOff ? (
        <Text size="xs" c="dimmed">
          No in-game warnings before this job. Run now still warns players briefly.
        </Text>
      ) : (
        <>
          {props.kind === "manual" && (
            <Text size="xs" c="dimmed">
              Short, fixed warning times keep manual restarts easy to scan. Regular sends notices at{" "}
              {formatMaintenancePresetHint("manual", "standard")}.
            </Text>
          )}
          {props.kind !== "manual" && props.warnings.preset === "custom" ? (
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
                      props.onChange(toggleCustomWarningOffset(props.warnings, offset));
                    }}
                  >
                    {offset}
                  </button>
                );
              })}
            </Group>
          ) : (
            <OffsetBadges offsetLabels={offsets} />
          )}
          {props.kind !== "manual" && props.warnings.preset === "custom" && props.warnings.customOffsets.length > 0 && (
            <OffsetBadges offsetLabels={props.warnings.customOffsets} />
          )}
          <div className={classes.nestedRow}>
            <div>
              <Text size="sm" fw={500}>
                Last minute in chat
              </Text>
              <Text size="xs" c="dimmed">
                Every second for the final 60 seconds. Run now always uses this.
              </Text>
            </div>
            <Switch
              size="sm"
              checked={props.warnings.lastMinuteChat}
              disabled={props.disabled}
              aria-label="Last minute in chat"
              onChange={(e) => {
                props.onChange({
                  ...props.warnings,
                  lastMinuteChat: e.currentTarget.checked,
                });
              }}
            />
          </div>
          <TextInput
            size="xs"
            label="Warning message"
            description="Players see this in global chat. Use {time} for the countdown."
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
        </>
      )}
    </Stack>
  );
}
