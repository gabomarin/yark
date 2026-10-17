import type { ReactElement } from "react";
import { ArrowCounterClockwise, ArrowUUpLeft } from "@phosphor-icons/react";
import { ActionIcon, NumberInput, Text, TextInput, Tooltip, VisuallyHidden } from "@mantine/core";
import { AppSwitch } from "@ui/AppSwitch/AppSwitch";
import {
  lookupDefaultValue,
  lookupSettingDescription,
  resolveControlKind,
  sectionShortName,
  type IniSettingReference,
} from "@features/server-workspace/iniModel";
import { numberInputValueFromIni } from "@features/server-workspace/iniNumberInput";
import classes from "./ClusterIniTemplateModal.module.css";

interface Props {
  row: IniSettingReference;
  unsaved?: boolean;
  savedValue?: string | null;
  onChange: (section: string, key: string, value: string, occurrence?: number) => void;
  onRevertToSaved?: (row: IniSettingReference) => void;
}

export function ClusterIniTemplateSettingRow(props: Props): ReactElement {
  const { row, onChange } = props;
  const unsaved = props.unsaved === true;
  const savedValue = props.savedValue ?? null;
  const defaultValue = lookupDefaultValue(row.fileKey, row.section, row.key);
  const canReset = defaultValue !== null && defaultValue !== row.value;
  const canRevertSaved = unsaved && props.onRevertToSaved !== undefined;
  const label = row.duplicateCount > 1 ? `${row.key} #${row.occurrence + 1}` : row.key;
  const revertLabel = savedValue !== null ? `Revert to saved value: ${savedValue}` : "Discard key (not in saved file)";
  const revertAriaLabel =
    savedValue !== null ? `Revert ${row.key} to saved value` : `Discard ${row.key} (not in saved file)`;

  return (
    <div
      className={`${classes.row}${unsaved ? ` ${classes.rowUnsaved}` : ""}`}
      data-ini-row-unsaved={unsaved ? "true" : undefined}
    >
      <div>
        <Text fw={600} size="sm">
          {label}
          {unsaved ? (
            <>
              <Text span c="attention" fw={700} aria-hidden data-ini-row-unsaved-status>
                {" *"}
              </Text>
              <VisuallyHidden>Unsaved</VisuallyHidden>
            </>
          ) : null}
        </Text>
        <Text c="dimmed" size="xs">
          {sectionShortName(row.section)}
        </Text>
      </div>
      <div>
        <ClusterIniTemplateSettingValue row={row} label={label} onChange={onChange} />
        {unsaved ? (
          <Text c="dimmed" size="xs" mt={4} data-ini-row-saved-value>
            {savedValue !== null
              ? `Last saved: ${savedValue.length > 0 ? savedValue : "(empty)"}`
              : "Last saved: (not in file)"}
          </Text>
        ) : null}
      </div>
      <Text c="dimmed" size="sm" lineClamp={3}>
        {lookupSettingDescription(row.fileKey, row.section, row.key)}
      </Text>
      <div className={classes.rowActions}>
        {canRevertSaved ? (
          <Tooltip label={revertLabel}>
            <ActionIcon
              variant="subtle"
              color="attention"
              aria-label={revertAriaLabel}
              data-ini-row-revert-saved
              onClick={() => props.onRevertToSaved?.(row)}
            >
              <ArrowCounterClockwise size={14} />
            </ActionIcon>
          </Tooltip>
        ) : null}
        <Tooltip label={canReset ? `Default: ${defaultValue}` : "No known default"}>
          <ActionIcon
            variant="subtle"
            color="gray"
            aria-label={`Reset ${row.key} to default`}
            disabled={!canReset}
            onClick={() => {
              if (defaultValue !== null) {
                onChange(row.section, row.key, defaultValue, row.occurrence);
              }
            }}
          >
            <ArrowUUpLeft size={14} />
          </ActionIcon>
        </Tooltip>
      </div>
    </div>
  );
}

function ClusterIniTemplateSettingValue(props: {
  row: IniSettingReference;
  label: string;
  onChange: Props["onChange"];
}): ReactElement {
  const { row, label, onChange } = props;
  const kind = resolveControlKind(row.value, {
    fileKey: row.fileKey,
    section: row.section,
    key: row.key,
  });
  if (kind === "boolean") {
    return (
      <AppSwitch
        aria-label={label}
        checked={row.value.toLowerCase() === "true"}
        onCheckedChange={(checked) => onChange(row.section, row.key, checked ? "True" : "False", row.occurrence)}
      />
    );
  }
  if (kind === "number") {
    return (
      <NumberInput
        value={numberInputValueFromIni(row.value)}
        onChange={(value) =>
          onChange(row.section, row.key, value === "" || value === undefined ? "" : String(value), row.occurrence)
        }
        decimalScale={4}
        hideControls={false}
      />
    );
  }
  return (
    <TextInput
      value={row.value}
      onChange={(event) => onChange(row.section, row.key, event.currentTarget.value, row.occurrence)}
    />
  );
}
