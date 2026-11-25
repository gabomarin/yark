import { copyTextToClipboard } from "@ui/copyToClipboard";
import { showOperatorError } from "@ui/operatorToast";
import { formatModIdsCsv, selectModIdsForCopy, type ModRow } from "./serverModsModel";

export function copyModProjectId(row: ModRow): void {
  if (row.id === null) return;
  void copyTextToClipboard({
    text: row.id,
    notifySuccess: true,
    successMessage: "Project ID copied",
    failureMessage: "Could not copy Project ID",
  });
}

export function copyModCurseForgeUrl(row: ModRow): void {
  if (row.url === null) return;
  void copyTextToClipboard({
    text: row.url,
    notifySuccess: true,
    successMessage: "CurseForge URL copied",
    failureMessage: "Could not copy CurseForge URL",
  });
}

/** Copy selected inventory Project IDs in load order (#635). */
export function copySelectedModProjectIds(configuredIds: string[], selectedIds: readonly string[]): void {
  const ids = selectModIdsForCopy(configuredIds, new Set(), "selected", new Set(selectedIds));
  if (ids.length === 0) {
    showOperatorError("No Project IDs to copy for that list", "Nothing to copy");
    return;
  }
  void copyTextToClipboard({
    text: formatModIdsCsv(ids),
    notifySuccess: true,
    successMessage: "Selected Project IDs copied",
    failureMessage: "Could not copy Project IDs",
  });
}
