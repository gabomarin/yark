import {
  ArrowCounterClockwise,
  ClipboardText,
  Export,
  FolderOpen,
  Trash,
} from "@phosphor-icons/react";
import type { BackupRecord } from "@shared/types";
import type { RowActionEntry } from "@ui/RowActionMenu/rowActionModel";

const ICON = 16;

export interface BackupHistoryRowActionInput {
  backup: BackupRecord;
  busy: boolean;
  opsLocked: boolean;
  onCopyDetails: (backup: BackupRecord) => void;
  onOpenFolder: (backupId: string) => void;
  onExport: (backup: BackupRecord) => void;
  onRestore: (backup: BackupRecord) => void;
  onDelete: (backup: BackupRecord) => void;
}

export function buildBackupHistoryRowActions(
  input: BackupHistoryRowActionInput,
): RowActionEntry[] {
  const canMutate = input.backup.status !== "running";
  const completed = input.backup.status === "completed";

  return [
    {
      kind: "item",
      key: "copy-details",
      label: "Copy details",
      icon: <ClipboardText size={ICON} />,
      disabled: input.busy,
      onClick: () => {
        input.onCopyDetails(input.backup);
      },
    },
    {
      kind: "item",
      key: "open-folder",
      label: "Open folder",
      icon: <FolderOpen size={ICON} />,
      disabled: input.busy,
      onClick: () => {
        input.onOpenFolder(input.backup.id);
      },
    },
    {
      kind: "item",
      key: "export",
      label: "Export a copy",
      icon: <Export size={ICON} />,
      disabled: input.busy || !completed,
      onClick: () => {
        input.onExport(input.backup);
      },
    },
    { kind: "divider", key: "div-mutate" },
    {
      kind: "item",
      key: "restore",
      label: "Restore",
      color: "orange",
      icon: <ArrowCounterClockwise size={ICON} />,
      disabled: input.busy || !completed || input.opsLocked,
      onClick: () => {
        input.onRestore(input.backup);
      },
    },
    {
      kind: "item",
      key: "delete",
      label: "Delete",
      color: "red",
      icon: <Trash size={ICON} />,
      disabled: input.busy || !canMutate,
      onClick: () => {
        input.onDelete(input.backup);
      },
    },
  ];
}
