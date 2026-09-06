import { CaretDown, CaretRight } from "@phosphor-icons/react";
import { Badge, Group, Text } from "@mantine/core";
import type { IniFileKey } from "@shared/types";
import chrome from "@ui/IniEditorChrome/IniEditorChrome.module.css";
import type { ReactElement } from "react";
import {
  iniUiSectionCollapseKey,
  type IniSettingReference,
  type IniUiCategoryGroup,
  type IniUiSectionGroup,
} from "../../iniModel";
import classes from "./ConfigurationEditor.module.css";
import { IniSettingRow } from "./IniSettingRow";

interface Props {
  loading: boolean;
  groupedRows: IniUiCategoryGroup[];
  collapsedSections: Record<string, boolean>;
  busy: boolean;
  onToggleSection: (sectionName: string) => void;
  onUpdateValue: (
    fileKey: IniFileKey,
    rowSection: string,
    key: string,
    value: string,
    occurrence?: number,
  ) => void;
  onResetRowToDefault: (row: IniSettingReference) => void;
  onOpenAdminList?: () => void;
}

function renderSettingRows(
  rows: IniSettingReference[],
  busy: boolean,
  onUpdateValue: Props["onUpdateValue"],
  onResetRowToDefault: Props["onResetRowToDefault"],
  onOpenAdminList: Props["onOpenAdminList"],
): ReactElement[] {
  return rows.map((row) => {
    const settingRow = row;
    const controlId = `${settingRow.fileKey}\u001f${settingRow.section}\u001f${settingRow.key}\u001f${settingRow.occurrence}`;
    return (
      <IniSettingRow
        key={controlId}
        row={settingRow}
        busy={busy}
        onUpdateValue={onUpdateValue}
        onResetRowToDefault={onResetRowToDefault}
        onOpenAdminList={onOpenAdminList}
      />
    );
  });
}

function renderSectionGroups(
  sectionGroups: IniUiSectionGroup[],
  category: IniUiCategoryGroup["category"],
  collapsedSections: Record<string, boolean>,
  busy: boolean,
  onToggleSection: (sectionName: string) => void,
  onUpdateValue: Props["onUpdateValue"],
  onResetRowToDefault: Props["onResetRowToDefault"],
  onOpenAdminList: Props["onOpenAdminList"],
): ReactElement[] {
  return sectionGroups.map((sectionGroup) => {
    const collapseKey = iniUiSectionCollapseKey(category, sectionGroup.section);
    const sectionCollapsed = collapsedSections[collapseKey] === true;
    return (
      <div key={collapseKey}>
        <button
          type="button"
          className={chrome.subsectionHeader}
          aria-expanded={!sectionCollapsed}
          data-ini-section-subheader={sectionGroup.section}
          onClick={() => onToggleSection(collapseKey)}
        >
          <Group gap="xs" wrap="nowrap">
            {sectionCollapsed ? <CaretRight size={13} /> : <CaretDown size={13} />}
            <Text fw={600} size="xs" className={chrome.subsectionHeaderLabel}>
              {sectionGroup.label}
            </Text>
            <Badge size="xs" variant="outline" className={chrome.subsectionCount}>
              {sectionGroup.rows.length}
            </Badge>
          </Group>
        </button>
        {!sectionCollapsed &&
          renderSettingRows(
            sectionGroup.rows as IniSettingReference[],
            busy,
            onUpdateValue,
            onResetRowToDefault,
            onOpenAdminList,
          )}
      </div>
    );
  });
}

export function ConfigurationEditorSettingsTable(props: Props): ReactElement {
  const {
    loading,
    groupedRows,
    collapsedSections,
    busy,
    onToggleSection,
    onUpdateValue,
    onResetRowToDefault,
  } = props;

  return (
    <div className={classes.tableWrap}>
      <div className={classes.tableHead}>
        <span>Setting</span>
        <span>Value</span>
        <span>Description</span>
        <span />
      </div>
      <div className={classes.tableBody} data-ini-settings-scroll>
        {loading && (
          <Text c="dimmed" p="md">
            Loading INI…
          </Text>
        )}
        {!loading && groupedRows.length === 0 && (
          <Text c="dimmed" p="md">
            No settings match this filter.
          </Text>
        )}
        {!loading &&
          groupedRows.map((group) => {
            const collapsed = collapsedSections[group.category] === true;
            const sectionGroups = group.sectionGroups;
            return (
              <div key={group.category} className={classes.sectionBlock}>
                <button
                  type="button"
                  className={chrome.sectionHeader}
                  aria-expanded={!collapsed}
                  onClick={() => onToggleSection(group.category)}
                >
                  <Group gap="xs" wrap="nowrap">
                    {collapsed ? <CaretRight size={14} /> : <CaretDown size={14} />}
                    <Text fw={700} size="sm" className={chrome.sectionHeaderLabel}>
                      {group.label}
                    </Text>
                    <Badge size="xs" variant="outline" className={chrome.sectionCount}>
                      {group.rows.length}
                    </Badge>
                  </Group>
                </button>

                {!collapsed &&
                  (sectionGroups !== undefined && sectionGroups.length > 0
                    ? renderSectionGroups(
                        sectionGroups,
                        group.category,
                        collapsedSections,
                        busy,
                        onToggleSection,
                        onUpdateValue,
                        onResetRowToDefault,
                        props.onOpenAdminList,
                      )
                    : renderSettingRows(
                        group.rows as IniSettingReference[],
                        busy,
                        onUpdateValue,
                        onResetRowToDefault,
                        props.onOpenAdminList,
                      ))}
              </div>
            );
          })}
      </div>
    </div>
  );
}
