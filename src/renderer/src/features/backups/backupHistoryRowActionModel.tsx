import { ArrowCounterClockwise, ClipboardText, Export, FolderOpen, Shield, Trash } from "@phosphor-icons/react";
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
  /** Opens the protect modal (context menu). Icon row uses the shield popover instead. */
  onProtect?: (backup: BackupRecord) => void;
}

export function buildBackupHistoryRowActions(input: BackupHistoryRowActionInput): RowActionEntry[] {
  const canMutate = input.backup.status !== "running";
  const completed = input.backup.status === "completed";

  const entries: RowActionEntry[] = [
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
      icon: <ArrowCounterClockwise size={ICON} />,
      disabled: input.busy || !completed || input.opsLocked,
      onClick: () => {
        input.onRestore(input.backup);
      },
    },
  ];

  if (input.onProtect !== undefined && completed) {
    entries.push({
      kind: "item",
      key: "protect",
      label: input.backup.isProtected ? "Edit protection…" : "Protect…",
      icon: <Shield size={ICON} weight={input.backup.isProtected ? "fill" : "regular"} />,
      disabled: input.busy,
      onClick: () => {
        input.onProtect?.(input.backup);
      },
    });
  }

  entries.push({
    kind: "item",
    key: "delete",
    label: "Delete",
    color: "red",
    icon: <Trash size={ICON} />,
    disabled: input.busy || !canMutate,
    onClick: () => {
      input.onDelete(input.backup);
    },
  });

  return entries;
}
