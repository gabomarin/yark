import {
  ASA_UI_CATEGORIES,
  asaUiCategoryLabel,
  resolveAsaUiCategory,
  type AsaUiCategoryId,
} from "@shared/asa-setting-ui-categories";
import type { IniFileKey } from "@shared/types";
import { sectionShortName } from "@shared/ini-text";

/** Minimal row shape for category grouping (avoids circular import with iniModel). */
export interface IniGroupingRow {
  section: string;
  key: string;
}

export interface IniGroupingReference extends IniGroupingRow {
  fileKey: IniFileKey;
}

/** Collapse-state key for an INI section subgroup under a UI category. */
export function iniUiSectionCollapseKey(
  category: AsaUiCategoryId,
  section: string,
): string {
  return `${category}\u001f${section}`;
}

export interface IniUiSectionGroup<T extends IniGroupingRow = IniGroupingRow> {
  section: string;
  label: string;
  rows: T[];
}

export interface IniUiCategoryGroup<T extends IniGroupingRow = IniGroupingRow> {
  category: AsaUiCategoryId;
  label: string;
  rows: T[];
  /** Mods always; Other when more than one INI section is present. */
  sectionGroups?: IniUiSectionGroup<T>[];
}

function compareIniRowsBySectionThenKey(
  a: Pick<IniGroupingRow, "section" | "key">,
  b: Pick<IniGroupingRow, "section" | "key">,
): number {
  return a.section.localeCompare(b.section) || a.key.localeCompare(b.key);
}

function shouldNestByIniSection(category: AsaUiCategoryId, rows: IniGroupingRow[]): boolean {
  if (category === "mods") {
    return rows.length > 0;
  }
  if (category === "other") {
    const sections = new Set(rows.map((row) => row.section.toLowerCase()));
    return sections.size > 1;
  }
  return false;
}

function buildIniSectionGroups<T extends IniGroupingRow>(rows: T[]): IniUiSectionGroup<T>[] {
  const buckets = new Map<string, T[]>();
  for (const row of rows) {
    const list = buckets.get(row.section);
    if (list !== undefined) {
      list.push(row);
    } else {
      buckets.set(row.section, [row]);
    }
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([section, list]) => {
      list.sort((left, right) => left.key.localeCompare(right.key));
      return {
        section,
        label: sectionShortName(section),
        rows: list,
      };
    });
}

function sortCategoryRows<T extends IniGroupingRow>(
  category: AsaUiCategoryId,
  list: T[],
): void {
  if (category === "mods" || category === "other") {
    list.sort(compareIniRowsBySectionThenKey);
    return;
  }
  list.sort((a, b) => a.key.localeCompare(b.key) || a.section.localeCompare(b.section));
}

/** Group by UI category (heuristic JSON), in taxonomy order. */
export function groupRowsByUiCategory<T extends IniGroupingRow>(
  rows: T[],
  fileKey: IniFileKey,
): IniUiCategoryGroup<T>[] {
  const buckets = new Map<AsaUiCategoryId, T[]>();
  for (const row of rows) {
    const category = resolveAsaUiCategory(fileKey, row.section, row.key);
    const list = buckets.get(category);
    if (list !== undefined) {
      list.push(row);
    } else {
      buckets.set(category, [row]);
    }
  }

  const groups: IniUiCategoryGroup<T>[] = [];
  for (const def of ASA_UI_CATEGORIES) {
    const list = buckets.get(def.id);
    if (list === undefined || list.length === 0) {
      continue;
    }
    sortCategoryRows(def.id, list);
    const group: IniUiCategoryGroup<T> = {
      category: def.id,
      label: asaUiCategoryLabel(def.id),
      rows: list,
    };
    if (shouldNestByIniSection(def.id, list)) {
      group.sectionGroups = buildIniSectionGroups(list);
    }
    groups.push(group);
  }
  return groups;
}

export function groupSettingReferencesByUiCategory<T extends IniGroupingReference>(
  rows: T[],
): IniUiCategoryGroup<T>[] {
  const buckets = new Map<AsaUiCategoryId, T[]>();
  for (const row of rows) {
    const category = resolveAsaUiCategory(row.fileKey, row.section, row.key);
    const list = buckets.get(category);
    if (list !== undefined) {
      list.push(row);
    } else {
      buckets.set(category, [row]);
    }
  }

  return ASA_UI_CATEGORIES.flatMap((definition) => {
    const list = buckets.get(definition.id);
    if (list === undefined || list.length === 0) {
      return [];
    }
    if (definition.id === "mods" || definition.id === "other") {
      list.sort(
        (a, b) =>
          a.section.localeCompare(b.section) ||
          a.key.localeCompare(b.key) ||
          a.fileKey.localeCompare(b.fileKey),
      );
    } else {
      list.sort(
        (a, b) =>
          a.key.localeCompare(b.key) ||
          a.fileKey.localeCompare(b.fileKey) ||
          a.section.localeCompare(b.section),
      );
    }
    const group: IniUiCategoryGroup<T> = {
      category: definition.id,
      label: asaUiCategoryLabel(definition.id),
      rows: list,
    };
    if (shouldNestByIniSection(definition.id, list)) {
      group.sectionGroups = buildIniSectionGroups(list);
    }
    return [group];
  });
}
