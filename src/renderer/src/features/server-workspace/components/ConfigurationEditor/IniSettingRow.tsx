import { ArrowUUpLeft } from "@phosphor-icons/react";
import {
  ActionIcon,
  NumberInput,
  Switch,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import type { IniFileKey } from "@shared/types";
import type { ReactElement } from "react";
import {
  lookupDefaultValue,
  lookupSettingDescription,
  resolveControlKind,
  sectionShortName,
  type IniSettingReference,
} from "../../iniModel";
import { numberInputValueFromIni } from "../../iniNumberInput";
import classes from "./ConfigurationEditor.module.css";

interface Props {
  row: IniSettingReference;
  busy: boolean;
  onUpdateValue: (
    fileKey: IniFileKey,
    rowSection: string,
    key: string,
    value: string,
    occurrence?: number,
  ) => void;
  onResetRowToDefault: (row: IniSettingReference) => void;
}

export function IniSettingRow(props: Props): ReactElement {
  const { row, busy, onUpdateValue, onResetRowToDefault } = props;

  const kind = resolveControlKind(row.value, {
    fileKey: row.fileKey,
    section: row.section,
    key: row.key,
  });
  const defaultValue = lookupDefaultValue(row.fileKey, row.section, row.key);
  const canResetDefault = defaultValue !== null && defaultValue !== row.value;
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
          {row.duplicateCount > 1
            ? ` · ${row.occurrence + 1}/${row.duplicateCount}`
            : ""}
        </Text>
      </div>
      <div>
        {kind === "boolean" ? (
          <Switch
            checked={row.value.toLowerCase() === "true"}
            onChange={(event) =>
              onUpdateValue(
                row.fileKey,
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
              onUpdateValue(
                row.fileKey,
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
              onUpdateValue(
                row.fileKey,
                row.section,
                row.key,
                event.currentTarget.value,
                row.occurrence,
              )
            }
          />
        )}
      </div>
      <Text c="dimmed" size="sm">
        {lookupSettingDescription(row.fileKey, row.section, row.key)}
      </Text>
      <div className={classes.rowActions}>
        <Tooltip
          label={
            canResetDefault
              ? `Default: ${defaultValue}`
              : "No known default for this key/section"
          }
        >
          <ActionIcon
            variant="subtle"
            color="gray"
            disabled={!canResetDefault || busy}
            aria-label={`Reset ${row.key} to default`}
            onClick={() => onResetRowToDefault(row)}
          >
            <ArrowUUpLeft size={14} />
          </ActionIcon>
        </Tooltip>
      </div>
    </div>
  );
}
