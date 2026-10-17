import { ArrowCounterClockwise, ArrowUUpLeft, ArrowSquareOut } from "@phosphor-icons/react";
import { ActionIcon, NumberInput, Text, TextInput, Tooltip, VisuallyHidden } from "@mantine/core";
import type { IniFileKey } from "@shared/types";
import { consumerForSetting } from "@shared/settings/hosted-resource-consumers";
import { HostedResourceSelector } from "@features/hosted-resources/components/HostedResourceSelector/HostedResourceSelector";
import { AppSwitch } from "@ui/AppSwitch/AppSwitch";
import type { ReactElement } from "react";
import {
  lookupDefaultValue,
  lookupSettingDescription,
  resolveControlKind,
  sectionShortName,
  humanizeIniKey,
  type IniSettingReference,
} from "../../iniModel";
import { numberInputValueFromIni } from "../../iniNumberInput";
import classes from "./ConfigurationEditor.module.css";

interface Props {
  row: IniSettingReference;
  busy: boolean;
  unsaved?: boolean;
  savedValue?: string | null;
  onUpdateValue: (fileKey: IniFileKey, rowSection: string, key: string, value: string, occurrence?: number) => void;
  onResetRowToDefault: (row: IniSettingReference) => void;
  onRevertRowToSaved?: (row: IniSettingReference) => void;
  /** Jump to RCON → Admins for AdminListURL (not edited in INI Files). */
  onOpenAdminList?: () => void;
}

function isAdminListUrlRow(row: IniSettingReference): boolean {
  return (
    row.fileKey === "gameUserSettings" &&
    row.section.trim().toLowerCase() === "serversettings" &&
    row.key.trim().toLowerCase() === "adminlisturl"
  );
}

export function IniSettingRow(props: Props): ReactElement {
  const { row, busy, onUpdateValue, onResetRowToDefault } = props;
  const unsaved = props.unsaved === true;
  const savedValue = props.savedValue ?? null;

  const kind = resolveControlKind(row.value, {
    fileKey: row.fileKey,
    section: row.section,
    key: row.key,
  });
  const defaultValue = lookupDefaultValue(row.fileKey, row.section, row.key);
  const canResetDefault = defaultValue !== null && defaultValue !== row.value;
  const canRevertSaved = unsaved && props.onRevertRowToSaved !== undefined;
  const revertLabel = savedValue !== null ? `Revert to saved value: ${savedValue}` : "Discard key (not in saved file)";
  const revertAriaLabel =
    savedValue !== null ? `Revert ${row.key} to saved value` : `Discard ${row.key} (not in saved file)`;
  const keyLabel = row.duplicateCount > 1 ? `${row.key} #${row.occurrence + 1}` : row.key;
  const humanLabel = humanizeIniKey(row.key);
  const label = humanLabel.length > 0 && humanLabel !== row.key ? humanLabel : keyLabel;
  const adminListUrl = isAdminListUrlRow(row);
  // Only the GameUserSettings rows the catalog declares as INI-edited get the selector;
  // AdminListURL is managed in RCON — Admins and stays read-only here.
  const hostedConsumer = consumerForSetting(row.key);
  // `hostedConsumer !== null` is repeated in the branch below because TS does not narrow
  // through this boolean.
  const hostedResourceRow =
    hostedConsumer !== null && hostedConsumer.surface === "ini-visual" && row.fileKey === "gameUserSettings";

  return (
    <div
      className={`${classes.row}${unsaved ? ` ${classes.rowUnsaved}` : ""}`}
      data-ini-row-unsaved={unsaved ? "true" : undefined}
    >
      <div>
        <GroupLabel
          label={label}
          keyLabel={keyLabel}
          section={row.section}
          duplicateCount={row.duplicateCount}
          occurrence={row.occurrence}
          unsaved={unsaved}
        />
      </div>
      <div>
        {adminListUrl ? (
          <Text size="sm" style={{ wordBreak: "break-all" }} c={row.value.trim().length > 0 ? undefined : "dimmed"}>
            {row.value.trim().length > 0 ? row.value : "Not set"}
          </Text>
        ) : hostedResourceRow && hostedConsumer !== null ? (
          <HostedResourceSelector
            consumer={hostedConsumer}
            value={row.value}
            label={null}
            size="xs"
            disabled={busy}
            onChange={(value) => onUpdateValue(row.fileKey, row.section, row.key, value, row.occurrence)}
          />
        ) : kind === "boolean" ? (
          <AppSwitch
            aria-label={label}
            checked={row.value.toLowerCase() === "true"}
            onCheckedChange={(checked) =>
              onUpdateValue(row.fileKey, row.section, row.key, checked ? "True" : "False", row.occurrence)
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
            hideControls
          />
        ) : (
          <TextInput
            value={row.value}
            onChange={(event) =>
              onUpdateValue(row.fileKey, row.section, row.key, event.currentTarget.value, row.occurrence)
            }
          />
        )}
        {unsaved ? (
          <Text c="dimmed" size="xs" mt={4} data-ini-row-saved-value>
            {savedValue !== null
              ? `Last saved: ${savedValue.length > 0 ? savedValue : "(empty)"}`
              : "Last saved: (not in file)"}
          </Text>
        ) : null}
      </div>
      <div>
        <Text c="dimmed" size="sm">
          {adminListUrl
            ? `${lookupSettingDescription(row.fileKey, row.section, row.key)} Edit in RCON → Admins.`
            : lookupSettingDescription(row.fileKey, row.section, row.key)}
        </Text>
      </div>
      <div className={classes.rowActions}>
        {adminListUrl && props.onOpenAdminList ? (
          <Tooltip label="Open RCON → Admins">
            <ActionIcon variant="subtle" color="gray" aria-label="Open RCON → Admins" onClick={props.onOpenAdminList}>
              <ArrowSquareOut size={14} />
            </ActionIcon>
          </Tooltip>
        ) : (
          <>
            {canRevertSaved ? (
              <Tooltip label={revertLabel}>
                <ActionIcon
                  variant="subtle"
                  color="attention"
                  disabled={busy}
                  aria-label={revertAriaLabel}
                  data-ini-row-revert-saved
                  onClick={() => props.onRevertRowToSaved?.(row)}
                >
                  <ArrowCounterClockwise size={14} />
                </ActionIcon>
              </Tooltip>
            ) : null}
            <Tooltip label={canResetDefault ? `Default: ${defaultValue}` : "No known default for this key/section"}>
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
          </>
        )}
      </div>
    </div>
  );
}

function GroupLabel(props: {
  label: string;
  keyLabel: string;
  section: string;
  duplicateCount: number;
  occurrence: number;
  unsaved: boolean;
}): ReactElement {
  return (
    <>
      <Text fw={600} size="sm">
        {props.label}
        {props.unsaved ? (
          <>
            <Text span c="attention" fw={700} aria-hidden data-ini-row-unsaved-status>
              {" *"}
            </Text>
            <VisuallyHidden>Unsaved</VisuallyHidden>
          </>
        ) : null}
      </Text>
      <Text c="dimmed" size="xs">
        {props.keyLabel === props.label
          ? sectionShortName(props.section)
          : `${props.keyLabel} · ${sectionShortName(props.section)}`}
        {props.duplicateCount > 1 ? ` · ${props.occurrence + 1}/${props.duplicateCount}` : ""}
      </Text>
    </>
  );
}
