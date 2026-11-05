import { iniUiSectionCollapseKey, type IniUiCategoryGroup } from "../../iniModel";

export function toggleCollapsedSection(
  prev: Record<string, boolean>,
  sectionName: string,
): Record<string, boolean> {
  return { ...prev, [sectionName]: !prev[sectionName] };
}

export function collapseCategorySections(
  prev: Record<string, boolean>,
  groups: readonly IniUiCategoryGroup[],
  category: string,
  collapsed: boolean,
): Record<string, boolean> | null {
  const group = groups.find((item) => item.category === category);
  if (group?.sectionGroups === undefined || group.sectionGroups.length === 0) return null;
  const next = { ...prev };
  for (const sectionGroup of group.sectionGroups) {
    next[iniUiSectionCollapseKey(group.category, sectionGroup.section)] = collapsed;
  }
  return next;
}

export function collapseAllSections(
  groups: readonly IniUiCategoryGroup[],
  collapsed: boolean,
): Record<string, boolean> {
  const next: Record<string, boolean> = {};
  for (const group of groups) {
    if (group.sectionGroups !== undefined && group.sectionGroups.length > 0) {
      for (const sectionGroup of group.sectionGroups) {
        next[iniUiSectionCollapseKey(group.category, sectionGroup.section)] = collapsed;
      }
    } else {
      next[group.category] = collapsed;
    }
  }
  return next;
}
