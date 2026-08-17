import type { ReactElement } from "react";
import { CaretDown, CaretRight, ArrowCounterClockwise, FunnelSimple, MagnifyingGlass } from "@phosphor-icons/react";
import {
  Badge,
  Button,
  Group,
  NumberInput,
  Select,
  Switch,
  Text,
  TextInput,
  Textarea,
} from "@mantine/core";
import type { IniFileKey, ServerIniPayload } from "@shared/types";
import { isAsaIgnoredIniMaxPlayers, isYarkOwnedIniKey } from "@shared/yark-owned-ini-keys";
import {
  filterIniSettingReferences,
  groupSettingReferencesByUiCategory,
  lookupDefaultValue,
  lookupSettingDescription,
  parseIniRows,
  resolveControlKind,
  sectionShortName,
  setIniValue,
  textForFile,
  withFileText,
  type IniFilterId,
  type IniSettingReference,
} from "@features/server-workspace/iniModel";
import { numberInputValueFromIni } from "@features/server-workspace/iniNumberInput";
import { useMemo, useState } from "react";
import chrome from "@ui/IniEditorChrome/IniEditorChrome.module.css";
import classes from "./ClusterIniTemplateModal.module.css";

interface Props {
  payload: ServerIniPayload;
  iniFile: IniFileKey;
  mode: "visual" | "raw";
  onPayloadChange: (next: ServerIniPayload) => void;
}

export function ClusterIniTemplateVisualPanel(props: Props): ReactElement {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<IniFilterId>("all");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const activeText = textForFile(props.payload, props.iniFile);
  const rows = useMemo<IniSettingReference[]>(() => {
    const parsed = parseIniRows(activeText).map((row) => ({
      ...row,
      fileKey: props.iniFile,
    }));
    if (props.iniFile !== "gameUserSettings") {
      return parsed;
    }
    return parsed.filter(
      (row) =>
        !isYarkOwnedIniKey(row.section, row.key) &&
        !isAsaIgnoredIniMaxPlayers(row.key),
    );
  }, [activeText, props.iniFile]);

  const availableRows = useMemo(
    () => filterIniSettingReferences(rows, "", "all"),
    [rows],
  );
  const categoryOptions = useMemo(
    () => [
      { value: "all", label: `All settings (${availableRows.length})` },
      ...groupSettingReferencesByUiCategory(availableRows).map((group) => ({
        value: group.category,
        label: `${group.label} (${group.rows.length})`,
      })),
    ],
    [availableRows],
  );
  const activeFilter = categoryOptions.some((option) => option.value === filter)
    ? filter
    : "all";
  const visibleRows = useMemo(
    () => filterIniSettingReferences(rows, search, activeFilter),
    [rows, search, activeFilter],
  );
  const groupedRows = useMemo(
    () => groupSettingReferencesByUiCategory(visibleRows),
    [visibleRows],
  );

  const updateValue = (
    section: string,
    key: string,
    value: string,
    occurrence = 0,
  ): void => {
    if (props.iniFile === "gameUserSettings" && isYarkOwnedIniKey(section, key)) {
      return;
    }
    props.onPayloadChange(
      withFileText(
        props.payload,
        props.iniFile,
        setIniValue(activeText, section, key, value, occurrence),
      ),
    );
  };

  if (props.mode === "raw") {
    return (
      <div className={classes.rawRoot} data-cluster-ini-raw>
        <Textarea
          className={classes.rawEditor}
          aria-label={`${props.iniFile} raw editor`}
          value={activeText}
          autosize={false}
          onChange={(event) =>
            props.onPayloadChange(
              withFileText(props.payload, props.iniFile, event.currentTarget.value),
            )
          }
        />
      </div>
    );
  }

  return (
    <div className={classes.visualRoot}>
      <Group gap="sm" wrap="wrap">
        <TextInput
          style={{ flex: 1, minWidth: 180 }}
          placeholder="Search settings"
          leftSection={<MagnifyingGlass size={14} />}
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
        />
        <Select
          style={{ width: 240 }}
          aria-label="Filter by category"
          leftSection={<FunnelSimple size={15} />}
          value={activeFilter}
          data={categoryOptions}
          searchable
          allowDeselect={false}
          nothingFoundMessage="No categories"
          onChange={(value) => setFilter((value ?? "all") as IniFilterId)}
        />
        <Button
          size="xs"
          variant="light"
          onClick={() => {
            const next: Record<string, boolean> = {};
            for (const group of groupedRows) next[group.category] = true;
            setCollapsed(next);
          }}
        >
          Collapse
        </Button>
        <Button size="xs" variant="light" onClick={() => setCollapsed({})}>
          Expand
        </Button>
      </Group>

      <div className={classes.tableWrap}>
        <div className={classes.tableHead}>
          <span>Setting</span>
          <span>Value</span>
          <span>Description</span>
          <span />
        </div>
        <div className={classes.tableBody}>
          {groupedRows.length === 0 ? (
            <Text c="dimmed" p="md" size="sm">
              No editable keys match this filter. Switch to Text to paste
              content, or save defaults first.
            </Text>
          ) : (
            groupedRows.map((group) => {
              const isCollapsed = collapsed[group.category] === true;
              return (
                <div key={group.category} className={classes.sectionBlock}>
                  <button
                    type="button"
                    className={chrome.sectionHeader}
                    aria-expanded={!isCollapsed}
                    onClick={() =>
                      setCollapsed((prev) => ({
                        ...prev,
                        [group.category]: !isCollapsed,
                      }))
                    }
                  >
                    {isCollapsed ? <CaretRight size={14} /> : <CaretDown size={14} />}
                    <Text fw={700} size="sm" className={chrome.sectionHeaderLabel}>
                      {group.label}
                    </Text>
                    <Badge size="xs" variant="outline" className={chrome.sectionCount}>
                      {group.rows.length}
                    </Badge>
                  </button>
                  {!isCollapsed &&
                    group.rows.map((row) => (
                      <SettingRow
                        key={`${row.section}-${row.key}-${row.occurrence}`}
                        row={row}
                        onChange={updateValue}
                      />
                    ))}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function SettingRow(props: {
  row: IniSettingReference;
  onChange: (
    section: string,
    key: string,
    value: string,
    occurrence?: number,
  ) => void;
}): ReactElement {
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
      <ActionReset
        disabled={!canReset}
        onClick={() => {
          if (defaultValue !== null) {
            onChange(row.section, row.key, defaultValue, row.occurrence);
          }
        }}
        label={row.key}
      />
    </div>
  );
}

function ActionReset(props: {
  disabled: boolean;
  onClick: () => void;
  label: string;
}): ReactElement {
  return (
    <Button
      variant="subtle"
      size="compact-xs"
      aria-label={`Reset ${props.label} to default`}
      disabled={props.disabled}
      onClick={props.onClick}
      px={6}
    >
      <ArrowCounterClockwise size={16} />
    </Button>
  );
}
