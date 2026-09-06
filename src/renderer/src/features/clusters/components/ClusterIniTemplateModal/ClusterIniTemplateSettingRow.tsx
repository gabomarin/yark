import type { ReactElement } from "react";
import { ArrowCounterClockwise } from "@phosphor-icons/react";
import { Button, NumberInput, Switch, Text, TextInput } from "@mantine/core";
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
  onChange: (
    section: string,
    key: string,
    value: string,
    occurrence?: number,
  ) => void;
}

export function ClusterIniTemplateSettingRow(props: Props): ReactElement {
  const { row, onChange } = props;
  const kind = resolveControlKind(row.value, {
    fileKey: row.fileKey,
    section: row.section,
    key: row.key,
  });
  const defaultValue = lookupDefaultValue(row.fileKey, row.section, row.key);
  const canReset = defaultValue !== null && defaultValue !== row.value;
  const label =
    row.duplicateCount > 1 ? `${row.key} #${row.occurrence + 1}` : row.key;

  return (
    <div className={classes.row}>
      <div>
        <Text fw={600} size="sm">
          {label}
        </Text>
        <Text c="dimmed" size="xs">
          {sectionShortName(row.section)}
        </Text>
      </div>
      <div>
        {kind === "boolean" ? (
          <Switch
            checked={row.value.toLowerCase() === "true"}
            onChange={(event) =>
              onChange(
                row.section,
                row.key,
                event.currentTarget.checked ? "True" : "False",
                row.occurrence,
              )
            }
          />
        ) : kind === "number" ? (
          <NumberInput
            value={numberInputValueFromIni(row.value)}
            onChange={(value) =>
              onChange(
                row.section,
                row.key,
                value === "" || value === undefined ? "" : String(value),
                row.occurrence,
              )
            }
            decimalScale={4}
            hideControls={false}
          />
        ) : (
          <TextInput
            value={row.value}
            onChange={(event) =>
              onChange(
                row.section,
                row.key,
                event.currentTarget.value,
                row.occurrence,
              )
            }
          />
        )}
      </div>
      <Text c="dimmed" size="sm" lineClamp={3}>
        {lookupSettingDescription(row.fileKey, row.section, row.key)}
      </Text>
      <Button
        variant="subtle"
        size="compact-xs"
        aria-label={`Reset ${row.key} to default`}
        disabled={!canReset}
        onClick={() => {
          if (defaultValue !== null) {
            onChange(row.section, row.key, defaultValue, row.occurrence);
          }
        }}
        px={6}
      >
        <ArrowCounterClockwise size={16} />
      </Button>
    </div>
  );
}
