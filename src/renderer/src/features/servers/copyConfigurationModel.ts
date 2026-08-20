import {
  emptyIniFileSelection,
  type ConfigTransferIniFileSelection,
  type ConfigTransferSelection,
} from "@shared/config-transfer";
import type {
  ConfigTransferIniCategoryInfo,
  ServerProfile,
  ServerRuntimeInfo,
  ServerStatus,
} from "@shared/types";

export type CopyConfigurationStep = 1 | 2 | 3 | 4;

export const MERGE_STRATEGY_TOOLTIP =
  "Update matching settings on the target. Everything else on the target stays the same.";

export const REPLACE_STRATEGY_TOOLTIP =
  "Overwrite the selected parts on the target. Extra settings only on the target in those parts are removed.";

export const MODS_MERGE_TOOLTIP =
  "Add source mods the target is missing. Existing target mods stay; disabled flags from either side are kept.";

export const MODS_REPLACE_TOOLTIP =
  "Replace the target mod list with the source list, including disabled state.";

export const EXTRA_ARGS_MERGE_TOOLTIP =
  "Merge Extra arguments and structured Launch options from the source. Matching Extra tokens stay; structured flags are overlaid by id.";

export const EXTRA_ARGS_REPLACE_TOOLTIP =
  "Replace Extra arguments and structured Launch options with the source.";

export function statusLabel(status: ServerStatus): string {
  if (status === "running") return "Running";
  if (status === "starting") return "Starting";
  if (status === "stopping") return "Stopping";
  if (status === "error") return "Error";
  return "Stopped";
}

export function isTargetEligible(status: ServerStatus | undefined): boolean {
  return status === "stopped" || status === undefined;
}

export function iniKeyRefId(section: string, key: string): string {
  return `${section}\u001f${key}`;
}

function allDescribeKeyIds(
  categories: ConfigTransferIniCategoryInfo[],
): string[] {
  return categories.flatMap((category) =>
    category.keys.map((row) => iniKeyRefId(row.section, row.key)),
  );
}

export function selectedIniKeyIds(
  file: ConfigTransferIniFileSelection,
  categories: ConfigTransferIniCategoryInfo[],
): Set<string> {
  if (!file.enabled) return new Set();
  if (file.entireFile) return new Set(allDescribeKeyIds(categories));

  const selected = new Set<string>();
  const sectionSet = new Set(file.sections.map((s) => s.toLowerCase()));
  for (const category of categories) {
    for (const row of category.keys) {
      if (sectionSet.has(row.section.toLowerCase())) {
        selected.add(iniKeyRefId(row.section, row.key));
      }
    }
  }
  for (const row of file.keys) {
    selected.add(iniKeyRefId(row.section, row.key));
  }
  return selected;
}

/** Group describe keys by raw INI section (compose still uses section names). */
function keysByRawSection(
  categories: ConfigTransferIniCategoryInfo[],
): Map<string, Array<{ section: string; key: string; id: string }>> {
  const bySection = new Map<
    string,
    Array<{ section: string; key: string; id: string }>
  >();
  const seen = new Set<string>();
  for (const category of categories) {
    for (const row of category.keys) {
      const id = iniKeyRefId(row.section, row.key);
      if (seen.has(id.toLowerCase())) continue;
      seen.add(id.toLowerCase());
      const bucketKey = row.section.toLowerCase();
      const list = bySection.get(bucketKey);
      const entry = { section: row.section, key: row.key, id };
      if (list !== undefined) list.push(entry);
      else bySection.set(bucketKey, [entry]);
    }
  }
  return bySection;
}

function rebuildIniFileSelection(
  strategy: ConfigTransferIniFileSelection["strategy"],
  categories: ConfigTransferIniCategoryInfo[],
  selected: Set<string>,
): ConfigTransferIniFileSelection {
  if (selected.size === 0) {
    return emptyIniFileSelection(strategy);
  }

  const allIds = allDescribeKeyIds(categories);
  const entireFile =
    allIds.length > 0 && allIds.every((id) => selected.has(id));

  if (entireFile) {
    const allKeys = categories.flatMap((c) => c.keys);
    const uniqueSections = [
      ...new Set(allKeys.map((row) => row.section)),
    ];
    return {
      enabled: true,
      strategy,
      entireFile: true,
      sections: uniqueSections,
      keys: allKeys,
    };
  }

  const nextSections: string[] = [];
  const nextKeys: Array<{ section: string; key: string }> = [];
  const bySection = keysByRawSection(categories);

  for (const entries of bySection.values()) {
    const selectedInSection = entries.filter((entry) => selected.has(entry.id));
    if (selectedInSection.length === 0) continue;
    if (selectedInSection.length === entries.length) {
      nextSections.push(entries[0]!.section);
      continue;
    }
    for (const entry of selectedInSection) {
      nextKeys.push({ section: entry.section, key: entry.key });
    }
  }

  return {
    enabled: true,
    strategy,
    entireFile: false,
    sections: nextSections,
    keys: nextKeys,
  };
}

/** File checkbox: select or clear every key in the INI file. */
export function toggleIniEntireFile(
  file: ConfigTransferIniFileSelection,
  enabled: boolean,
  describeCategories: ConfigTransferIniCategoryInfo[],
): ConfigTransferIniFileSelection {
  if (!enabled) {
    return emptyIniFileSelection(file.strategy);
  }
  return rebuildIniFileSelection(
    file.strategy,
    describeCategories,
    new Set(allDescribeKeyIds(describeCategories)),
  );
}

export function setIniStrategy(
  file: ConfigTransferIniFileSelection,
  strategy: ConfigTransferIniFileSelection["strategy"],
): ConfigTransferIniFileSelection {
  return { ...file, strategy };
}

/** UI category checkbox (same groups as the server INI editor). */
export function toggleIniCategoryKeys(
  file: ConfigTransferIniFileSelection,
  describeCategories: ConfigTransferIniCategoryInfo[],
  categoryId: string,
  enabled: boolean,
): ConfigTransferIniFileSelection {
  const selected = selectedIniKeyIds(file, describeCategories);
  const category = describeCategories.find((c) => c.id === categoryId);
  if (category === undefined) return file;
  for (const row of category.keys) {
    const id = iniKeyRefId(row.section, row.key);
    if (enabled) selected.add(id);
    else selected.delete(id);
  }
  return rebuildIniFileSelection(file.strategy, describeCategories, selected);
}

export function toggleIniKey(
  file: ConfigTransferIniFileSelection,
  describeCategories: ConfigTransferIniCategoryInfo[],
  sectionName: string,
  key: string,
  enabled: boolean,
): ConfigTransferIniFileSelection {
  const selected = selectedIniKeyIds(file, describeCategories);
  const id = iniKeyRefId(sectionName, key);
  if (enabled) selected.add(id);
  else selected.delete(id);
  return rebuildIniFileSelection(file.strategy, describeCategories, selected);
}

export function categorySelectionState(
  file: ConfigTransferIniFileSelection,
  describeCategories: ConfigTransferIniCategoryInfo[],
  categoryId: string,
): {
  checked: boolean;
  indeterminate: boolean;
  selectedCount: number;
  total: number;
} {
  const category = describeCategories.find((c) => c.id === categoryId);
  if (category === undefined || category.keys.length === 0) {
    return { checked: false, indeterminate: false, selectedCount: 0, total: 0 };
  }
  const selected = selectedIniKeyIds(file, describeCategories);
  const selectedCount = category.keys.filter((row) =>
    selected.has(iniKeyRefId(row.section, row.key)),
  ).length;
  return {
    checked: selectedCount === category.keys.length,
    indeterminate: selectedCount > 0 && selectedCount < category.keys.length,
    selectedCount,
    total: category.keys.length,
  };
}

export function fileSelectionState(
  file: ConfigTransferIniFileSelection,
  describeCategories: ConfigTransferIniCategoryInfo[],
): { checked: boolean; indeterminate: boolean } {
  const allIds = allDescribeKeyIds(describeCategories);
  if (allIds.length === 0) {
    return { checked: file.enabled, indeterminate: false };
  }
  const selected = selectedIniKeyIds(file, describeCategories);
  const count = allIds.filter((id) => selected.has(id)).length;
  return {
    checked: count === allIds.length,
    indeterminate: count > 0 && count < allIds.length,
  };
}

export function selectionHasWork(selection: ConfigTransferSelection): boolean {
  return (
    (selection.gameUserSettings.enabled &&
      (selection.gameUserSettings.entireFile ||
        selection.gameUserSettings.sections.length > 0 ||
        selection.gameUserSettings.keys.length > 0)) ||
    (selection.game.enabled &&
      (selection.game.entireFile ||
        selection.game.sections.length > 0 ||
        selection.game.keys.length > 0)) ||
    selection.mods.enabled ||
    selection.extraArgs.enabled ||
    selection.backupPolicy ||
    selection.passwords
  );
}

export function listCopyTargets(
  servers: ServerProfile[],
  sourceId: string,
): ServerProfile[] {
  return servers.filter((s) => s.id !== sourceId);
}

export function toggleTargetId(
  selected: string[],
  targetId: string,
  enabled: boolean,
): string[] {
  if (enabled) {
    if (selected.includes(targetId)) return selected;
    return [...selected, targetId];
  }
  return selected.filter((id) => id !== targetId);
}

export function toggleAllTargetIds(
  selected: string[],
  eligibleIds: string[],
  enabled: boolean,
): string[] {
  if (!enabled) {
    const drop = new Set(eligibleIds);
    return selected.filter((id) => !drop.has(id));
  }
  const next = new Set(selected);
  for (const id of eligibleIds) next.add(id);
  return [...next];
}

export function targetListSelectionState(
  selected: string[],
  optionIds: string[],
): { checked: boolean; indeterminate: boolean; selectedCount: number } {
  if (optionIds.length === 0) {
    return { checked: false, indeterminate: false, selectedCount: 0 };
  }
  const selectedCount = optionIds.filter((id) => selected.includes(id)).length;
  return {
    checked: selectedCount === optionIds.length,
    indeterminate: selectedCount > 0 && selectedCount < optionIds.length,
    selectedCount,
  };
}

/** True when every selected target is stopped (or unknown → treated as stopped). */
export function allTargetsEligible(
  targetIds: string[],
  statuses: Map<string, ServerRuntimeInfo>,
): boolean {
  if (targetIds.length === 0) return false;
  return targetIds.every((id) =>
    isTargetEligible(runtimeStatus(statuses, id)),
  );
}

export function formatTargetNames(
  servers: ServerProfile[],
  targetIds: string[],
): string {
  const names = targetIds
    .map((id) => servers.find((s) => s.id === id)?.name)
    .filter((name): name is string => name !== undefined);
  if (names.length === 0) return "…";
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]} + ${names.length - 1} more`;
}

export function runtimeStatus(
  statuses: Map<string, ServerRuntimeInfo>,
  serverId: string,
): ServerStatus {
  return statuses.get(serverId)?.status ?? "stopped";
}

export function shortSectionLabel(section: string): string {
  if (section === "(root)") return "(root)";
  const lastDot = section.lastIndexOf(".");
  if (lastDot >= 0 && lastDot < section.length - 1) {
    return section.slice(lastDot + 1);
  }
  return section.replace(/^\//, "");
}
