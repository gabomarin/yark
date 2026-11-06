import { useDeferredValue, useEffect, useMemo, useState, type ReactElement } from "react";
import { resolveAsaUiCategory } from "@shared/asa/asa-setting-ui-categories";
import {
  filterIniRows,
  groupSettingReferencesByFileOrder,
  groupSettingReferencesByUiCategory,
  iniFileOrderCollapseKey,
  iniUiSectionCollapseKey,
  parseIniRows,
  textForFile,
  type IniSettingReference,
  type IniSettingsSort,
  type IniUiCategoryGroup,
} from "../../iniModel";
import { readStoredIniSettingsSort, writeStoredIniSettingsSort } from "../../iniSettingsSort";
import {
  collapseAllSections,
  collapseCategorySections,
  collapseFileOrderSections,
} from "./configurationEditorSections";
import { iniRowIdentity } from "./configurationEditorModel";
import { ConfigurationEditorFilterBar } from "./ConfigurationEditorFilterBar";
import { ConfigurationEditorSettingsTable } from "./ConfigurationEditorSettingsTable";
import type { ConfigurationEditorApi } from "./configurationEditorTypes";

interface Props {
  editor: ConfigurationEditorApi;
  onOpenAdminList?: () => void;
}

export function ConfigurationEditorSettingsPane(props: Props): ReactElement {
  const { editor } = props;
  const [sort, setSort] = useState<IniSettingsSort>(readStoredIniSettingsSort);
  const tableSort = useDeferredValue(sort);
  const [addedRowId, setAddedRowId] = useState<string | null>(null);
  const fileOrderSections = useMemo(() => groupSettingReferencesByFileOrder(editor.visibleRows), [editor.visibleRows]);
  const categoryFileGroups = useMemo(
    () => groupSettingReferencesByUiCategory(editor.visibleRows, "file"),
    [editor.visibleRows],
  );
  const keysInSection = useMemo(
    () => keysPresentInFile(editor.payload, editor.iniFile),
    [editor.payload, editor.iniFile],
  );
  const fileSections = useMemo(
    () => sectionsPresentInFile(editor.payload, editor.iniFile),
    [editor.payload, editor.iniFile],
  );
  const onSortChange = (next: IniSettingsSort) => {
    setSort(next);
    writeStoredIniSettingsSort(next);
  };

  const collapseVisible = (collapsed: boolean) => {
    editor.setCollapsedSections(
      tableSort === "unsorted"
        ? collapseFileOrderSections(fileOrderSections, collapsed)
        : collapseAllSections(editor.groupedRows, collapsed),
    );
  };

  const setCategoryGroupsCollapsed = (category: string, collapsed: boolean) => {
    const next = collapseCategorySections(editor.collapsedSections, editor.groupedRows, category, collapsed);
    if (next !== null) editor.setCollapsedSections(next);
  };

  const onAddSetting = (section: string, key: string, value: string) => {
    const category = resolveAsaUiCategory(editor.iniFile, section, key);
    const reveal = tableSort === "unsorted" ? iniFileOrderCollapseKey(section) : collapseKeyForCategory(category, section);
    editor.updateValue(editor.iniFile, section, key, value, 0);
    editor.setCollapsedSections({ ...editor.collapsedSections, [reveal]: false });
    const nextFilter = editor.filter !== "all" && editor.filter !== category ? "all" : editor.filter;
    if (nextFilter !== editor.filter) editor.setFilter(nextFilter);
    const probe = { section, key, value, occurrence: 0, duplicateCount: 1 };
    if (filterIniRows([probe], editor.search, nextFilter, editor.iniFile).length === 0) {
      editor.setSearch("");
    }
    setAddedRowId(iniRowIdentity(editor.iniFile, section, key, 0));
  };

  useEffect(() => {
    if (addedRowId === null) return;
    const frame = window.requestAnimationFrame(() => revealAddedIniRow(addedRowId));
    const timer = window.setTimeout(() => setAddedRowId(null), 1600);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [addedRowId]);

  return (
    <>
      <ConfigurationEditorFilterBar
        search={editor.search}
        onSearchChange={editor.setSearch}
        filter={editor.filter}
        onFilterChange={editor.setFilter}
        categoryOptions={editor.categoryOptions}
        dirty={editor.dirty}
        unsavedRowCount={editor.unsavedRowCount}
        sort={sort}
        onSortChange={onSortChange}
        onCollapseAll={() => collapseVisible(true)}
        onExpandAll={() => collapseVisible(false)}
      />
      <ConfigurationEditorSettingsTable
        loading={editor.loading}
        iniFile={editor.iniFile}
        fileSections={fileSections}
        sort={tableSort}
        groupedRows={
          tableSort === "asInFile"
            ? categoryFileGroups
            : (editor.groupedRows as IniUiCategoryGroup<IniSettingReference>[])
        }
        fileOrderSections={fileOrderSections}
        highlightRowId={addedRowId}
        keysInSection={keysInSection}
        onAddSetting={onAddSetting}
        collapsedSections={editor.collapsedSections}
        busy={editor.busy}
        isRowUnsaved={editor.isRowUnsaved}
        savedValueForRow={editor.savedValueForRow}
        onToggleSection={editor.toggleSection}
        onSetSectionGroupsCollapsed={setCategoryGroupsCollapsed}
        onUpdateValue={editor.updateValue}
        onResetRowToDefault={editor.resetRowToDefault}
        onRevertRowToSaved={editor.revertRowToSaved}
        onOpenAdminList={props.onOpenAdminList}
      />
    </>
  );
}

function sectionsPresentInFile(
  payload: ConfigurationEditorApi["payload"],
  iniFile: ConfigurationEditorApi["iniFile"],
): string[] {
  const seen = new Set<string>();
  const sections: string[] = [];
  if (payload === null) return sections;
  for (const row of parseIniRows(textForFile(payload, iniFile))) {
    const key = row.section.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    sections.push(row.section);
  }
  return sections;
}

function keysPresentInFile(
  payload: ConfigurationEditorApi["payload"],
  iniFile: ConfigurationEditorApi["iniFile"],
): ReadonlyMap<string, ReadonlySet<string>> {
  const map = new Map<string, Set<string>>();
  if (payload === null) return map;
  for (const row of parseIniRows(textForFile(payload, iniFile))) {
    const sectionKey = row.section.toLowerCase();
    const keys = map.get(sectionKey) ?? new Set<string>();
    keys.add(row.key.toLowerCase());
    map.set(sectionKey, keys);
  }
  return map;
}

function collapseKeyForCategory(category: string, section: string): string {
  if (category === "other") return iniUiSectionCollapseKey("other", section);
  return category;
}

function revealAddedIniRow(rowId: string): void {
  const root = document.querySelector("[data-ini-settings-scroll]");
  if (!(root instanceof HTMLElement)) return;
  const row = [...root.querySelectorAll<HTMLElement>("[data-ini-row]")].find(
    (node) => node.getAttribute("data-ini-row") === rowId,
  );
  if (row === undefined) return;
  const scroller = scrollParent(root);
  const rowRect = row.getBoundingClientRect();
  const view = scroller.getBoundingClientRect();
  const outside = rowRect.top < view.top || rowRect.bottom > view.bottom;
  if (outside) row.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function scrollParent(node: HTMLElement): HTMLElement {
  let current = node.parentElement;
  while (current !== null) {
    const overflow = getComputedStyle(current).overflowY;
    if (overflow === "auto" || overflow === "scroll") return current;
    current = current.parentElement;
  }
  return node;
}
