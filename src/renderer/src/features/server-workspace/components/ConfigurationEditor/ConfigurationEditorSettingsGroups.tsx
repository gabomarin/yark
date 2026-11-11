import { ArrowsInLineVertical, ArrowsOutLineVertical, CaretDown, CaretRight } from "@phosphor-icons/react";
import { ActionIcon, Badge, Group, Text, Tooltip } from "@mantine/core";
import type { ReactElement, ReactNode } from "react";
import type { IniFileKey } from "@shared/types";
import chrome from "@ui/IniEditorChrome/IniEditorChrome.module.css";
import {
  iniFileOrderCollapseKey,
  iniUiSectionCollapseKey,
  type IniSettingReference,
  type IniUiCategoryGroup,
  type IniUiSectionGroup,
} from "../../iniModel";
import classes from "./ConfigurationEditor.module.css";
import { iniRowIdentity } from "./configurationEditorModel";
import { IniSettingRow } from "./IniSettingRow";

export interface SettingsGroupActions {
  busy: boolean;
  highlightRowId: string | null;
  isRowUnsaved: (row: IniSettingReference) => boolean;
  savedValueForRow: (row: IniSettingReference) => string | null;
  onToggleSection: (sectionName: string) => void;
  onSetSectionGroupsCollapsed: (category: string, collapsed: boolean) => void;
  onUpdateValue: (fileKey: IniFileKey, rowSection: string, key: string, value: string, occurrence?: number) => void;
  onResetRowToDefault: (row: IniSettingReference) => void;
  onRevertRowToSaved: (row: IniSettingReference) => void;
  onOpenAdminList?: () => void;
}

function renderSettingRows(rows: IniSettingReference[], actions: SettingsGroupActions): ReactElement[] {
  return rows.map((row) => {
    const controlId = iniRowIdentity(row.fileKey, row.section, row.key, row.occurrence);
    return (
      <IniSettingRow
        key={controlId}
        row={row}
        busy={actions.busy}
        unsaved={actions.isRowUnsaved(row)}
        savedValue={actions.savedValueForRow(row)}
        highlighted={actions.highlightRowId === controlId}
        onUpdateValue={actions.onUpdateValue}
        onResetRowToDefault={actions.onResetRowToDefault}
        onRevertRowToSaved={actions.onRevertRowToSaved}
        onOpenAdminList={actions.onOpenAdminList}
      />
    );
  });
}

function SectionHeading(props: {
  className: string | undefined;
  expanded: boolean;
  dataAttr?: { name: "data-ini-file-section" | "data-ini-section-subheader"; value: string };
  onToggle: () => void;
  children: ReactNode;
}): ReactElement {
  return (
    <div className={classes.sectionHeaderRow}>
      <button
        type="button"
        className={props.className}
        aria-expanded={props.expanded}
        {...(props.dataAttr === undefined ? {} : { [props.dataAttr.name]: props.dataAttr.value })}
        onClick={props.onToggle}
      >
        {props.children}
      </button>
    </div>
  );
}

function renderSectionGroups(
  sectionGroups: IniUiSectionGroup<IniSettingReference>[],
  category: IniUiCategoryGroup["category"],
  collapsedSections: Record<string, boolean>,
  actions: SettingsGroupActions,
): ReactElement[] {
  return sectionGroups.map((sectionGroup) => {
    const collapseKey = iniUiSectionCollapseKey(category, sectionGroup.section);
    const sectionCollapsed = collapsedSections[collapseKey] === true;
    const rows = sectionGroup.rows as IniSettingReference[];
    return (
      <div key={collapseKey}>
        <SectionHeading
          className={chrome.subsectionHeader}
          expanded={!sectionCollapsed}
          dataAttr={{ name: "data-ini-section-subheader", value: sectionGroup.section }}
          onToggle={() => actions.onToggleSection(collapseKey)}
        >
          <Group gap="xs" wrap="nowrap">
            {sectionCollapsed ? <CaretRight size={13} /> : <CaretDown size={13} />}
            <Text fw={600} size="xs" className={chrome.subsectionHeaderLabel}>
              {sectionGroup.label}
            </Text>
            <Badge variant="outline">{rows.length}</Badge>
          </Group>
        </SectionHeading>
        {!sectionCollapsed && renderSettingRows(rows, actions)}
      </div>
    );
  });
}

function OtherCategoryHeader(props: {
  label: string;
  rowCount: number;
  onCollapseSubgroups: () => void;
  onExpandSubgroups: () => void;
}): ReactElement {
  return (
    <div className={chrome.sectionHeaderStatic} data-ini-other-header>
      <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
        <Text fw={700} size="sm" className={chrome.sectionHeaderLabel}>
          {props.label}
        </Text>
        <Badge variant="outline" className={chrome.sectionCount}>
          {props.rowCount}
        </Badge>
      </Group>
      <Group gap={4} wrap="nowrap">
        <Tooltip label="Collapse all sections">
          <ActionIcon
            variant="subtle"
            size="sm"
            color="gray"
            aria-label="Collapse all Other sections"
            onClick={props.onCollapseSubgroups}
          >
            <ArrowsInLineVertical size={14} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Expand all sections">
          <ActionIcon
            variant="subtle"
            size="sm"
            color="gray"
            aria-label="Expand all Other sections"
            onClick={props.onExpandSubgroups}
          >
            <ArrowsOutLineVertical size={14} />
          </ActionIcon>
        </Tooltip>
      </Group>
    </div>
  );
}

export function renderCategoryGroups(
  groupedRows: IniUiCategoryGroup<IniSettingReference>[],
  collapsedSections: Record<string, boolean>,
  actions: SettingsGroupActions,
): ReactElement[] {
  return groupedRows.map((group) => {
    const sectionGroups = group.sectionGroups as IniUiSectionGroup<IniSettingReference>[] | undefined;
    const nestedOther = group.category === "other" && sectionGroups !== undefined && sectionGroups.length > 0;
    if (nestedOther) {
      return (
        <div key={group.category} className={classes.sectionBlock}>
          <OtherCategoryHeader
            label={group.label}
            rowCount={group.rows.length}
            onCollapseSubgroups={() => actions.onSetSectionGroupsCollapsed(group.category, true)}
            onExpandSubgroups={() => actions.onSetSectionGroupsCollapsed(group.category, false)}
          />
          {renderSectionGroups(sectionGroups, group.category, collapsedSections, actions)}
        </div>
      );
    }

    const collapsed = collapsedSections[group.category] === true;
    const rows = group.rows;
    return (
      <div key={group.category} className={classes.sectionBlock}>
        <SectionHeading
          className={chrome.sectionHeader}
          expanded={!collapsed}
          onToggle={() => actions.onToggleSection(group.category)}
        >
          <Group gap="xs" wrap="nowrap">
            {collapsed ? <CaretRight size={14} /> : <CaretDown size={14} />}
            <Text fw={700} size="sm" className={chrome.sectionHeaderLabel}>
              {group.label}
            </Text>
            <Badge variant="outline" className={chrome.sectionCount}>
              {rows.length}
            </Badge>
          </Group>
        </SectionHeading>
        {!collapsed && renderSettingRows(rows, actions)}
      </div>
    );
  });
}

export function renderFileOrderSections(
  sections: IniUiSectionGroup<IniSettingReference>[],
  collapsedSections: Record<string, boolean>,
  actions: SettingsGroupActions,
): ReactElement[] {
  return sections.map((sectionGroup) => {
    const collapseKey = iniFileOrderCollapseKey(sectionGroup.section);
    const collapsed = collapsedSections[collapseKey] === true;
    return (
      <div key={collapseKey} className={classes.sectionBlock}>
        <SectionHeading
          className={chrome.sectionHeader}
          expanded={!collapsed}
          dataAttr={{ name: "data-ini-file-section", value: sectionGroup.section }}
          onToggle={() => actions.onToggleSection(collapseKey)}
        >
          <Group gap="xs" wrap="nowrap">
            {collapsed ? <CaretRight size={14} /> : <CaretDown size={14} />}
            <Text fw={700} size="sm" className={chrome.sectionHeaderLabel}>
              {sectionGroup.label}
            </Text>
            <Badge variant="outline" className={chrome.sectionCount}>
              {sectionGroup.rows.length}
            </Badge>
          </Group>
        </SectionHeading>
        {!collapsed && renderSettingRows(sectionGroup.rows, actions)}
      </div>
    );
  });
}
