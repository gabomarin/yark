import { copyTextToClipboard } from "@ui/copyToClipboard";
import type { ModRow } from "./serverModsModel";

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
