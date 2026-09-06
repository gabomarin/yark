import type { ReactElement } from "react";
import { CaretDown, CaretRight, FunnelSimple } from "@phosphor-icons/react";
import { Badge, Button, Group, Select, Text, Textarea } from "@mantine/core";
import type { IniFileKey, ServerIniPayload } from "@shared/types";
import { isAsaIgnoredIniMaxPlayers, isYarkOwnedIniKey } from "@shared/yark-owned-ini-keys";
import {
  filterIniSettingReferences,
  groupSettingReferencesByUiCategory,
  parseIniRows,
  setIniValue,
  textForFile,
  withFileText,
  type IniFilterId,
  type IniSettingReference,
} from "@features/server-workspace/iniModel";
import { useMemo, useState } from "react";
import chrome from "@ui/IniEditorChrome/IniEditorChrome.module.css";
import { SearchField } from "@ui/SearchField/SearchField";
import { ClusterIniTemplateSettingRow } from "./ClusterIniTemplateSettingRow";
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
        <SearchField
          style={{ flex: 1, minWidth: 180 }}
          size="xs"
          placeholder="Search settings"
          label="Search settings"
          value={search}
          onChange={setSearch}
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
                    (group.sectionGroups !== undefined && group.sectionGroups.length > 0
                      ? group.sectionGroups.map((sectionGroup) => {
                          const collapseKey = `${group.category}\u001f${sectionGroup.section}`;
                          const sectionCollapsed = collapsed[collapseKey] === true;
                          return (
                            <div key={collapseKey}>
                              <button
                                type="button"
                                className={chrome.subsectionHeader}
                                aria-expanded={!sectionCollapsed}
                                data-ini-section-subheader={sectionGroup.section}
                                onClick={() =>
                                  setCollapsed((prev) => ({
                                    ...prev,
                                    [collapseKey]: !sectionCollapsed,
                                  }))
                                }
                              >
                                {sectionCollapsed ? (
                                  <CaretRight size={13} />
                                ) : (
                                  <CaretDown size={13} />
                                )}
                                <Text fw={600} size="xs" className={chrome.subsectionHeaderLabel}>
                                  {sectionGroup.label}
                                </Text>
                                <Badge
                                  size="xs"
                                  variant="outline"
                                  className={chrome.subsectionCount}
                                >
                                  {sectionGroup.rows.length}
                                </Badge>
                              </button>
                              {!sectionCollapsed &&
                                sectionGroup.rows.map((row) => (
                                  <ClusterIniTemplateSettingRow
                                    key={`${row.section}-${row.key}-${row.occurrence}`}
                                    row={row}
                                    onChange={updateValue}
                                  />
                                ))}
                            </div>
                          );
                        })
                      : group.rows.map((row) => (
                          <ClusterIniTemplateSettingRow
                            key={`${row.section}-${row.key}-${row.occurrence}`}
                            row={row}
                            onChange={updateValue}
                          />
                        )))}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
