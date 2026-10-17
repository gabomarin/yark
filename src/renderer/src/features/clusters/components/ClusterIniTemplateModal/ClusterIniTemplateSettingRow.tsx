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
  const kind = resolveControlKind(row.value, {
    fileKey: row.fileKey,
    section: row.section,
    key: row.key,
  });
  const defaultValue = lookupDefaultValue(row.fileKey, row.section, row.key);
  const canReset = defaultValue !== null && defaultValue !== row.value;
  const canRevertSaved = unsaved && savedValue !== null && props.onRevertToSaved !== undefined;
  const label = row.duplicateCount > 1 ? `${row.key} #${row.occurrence + 1}` : row.key;

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
        {kind === "boolean" ? (
          <AppSwitch
            aria-label={label}
            checked={row.value.toLowerCase() === "true"}
            onCheckedChange={(checked) => onChange(row.section, row.key, checked ? "True" : "False", row.occurrence)}
          />
        ) : kind === "number" ? (
          <NumberInput
            value={numberInputValueFromIni(row.value)}
            onChange={(value) =>
              onChange(row.section, row.key, value === "" || value === undefined ? "" : String(value), row.occurrence)
            }
            decimalScale={4}
            hideControls={false}
          />
        ) : (
          <TextInput
            value={row.value}
            onChange={(event) => onChange(row.section, row.key, event.currentTarget.value, row.occurrence)}
          />
        )}
        {unsaved && savedValue !== null && (
          <Text c="dimmed" size="xs" mt={4} data-ini-row-saved-value>
            Last saved: {savedValue.length > 0 ? savedValue : "(empty)"}
          </Text>
        )}
      </div>
      <Text c="dimmed" size="sm" lineClamp={3}>
        {lookupSettingDescription(row.fileKey, row.section, row.key)}
      </Text>
      <div className={classes.rowActions}>
        {canRevertSaved ? (
          <Tooltip label={`Revert to saved value: ${savedValue}`}>
            <ActionIcon
              variant="subtle"
              color="attention"
              aria-label={`Revert ${row.key} to saved value`}
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
