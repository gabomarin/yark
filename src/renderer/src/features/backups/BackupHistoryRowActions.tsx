import type { ReactElement } from "react";
import { ArrowCounterClockwise, ClipboardText, Export, FolderOpen, Trash } from "@phosphor-icons/react";
import { ActionIcon, Group, Tooltip } from "@mantine/core";
import type { BackupRecord } from "@shared/types";
import { BackupProtectionPopover } from "./components/BackupProtectionPopover/BackupProtectionPopover";
import { buildBackupHistoryRowActions, type BackupHistoryRowActionInput } from "./backupHistoryRowActionModel";

type Props = BackupHistoryRowActionInput & {
  protectionSaving?: boolean;
  onSaveProtection?: (backup: BackupRecord, isProtected: boolean, operatorNote: string) => Promise<boolean>;
};

function itemDisabled(entries: ReturnType<typeof buildBackupHistoryRowActions>, key: string): boolean {
  const item = entries.find((entry) => entry.kind === "item" && entry.key === key);
  return item?.kind === "item" ? item.disabled === true : true;
}

/**
 * Icon row for backup history. Right-click on the row uses the same action model.
 */
export function BackupHistoryRowActions(props: Props): ReactElement {
  const menuEntries = buildBackupHistoryRowActions(props);
  const showProtect =
    props.backup.status === "completed" && !props.backup.diskMissing && props.onSaveProtection !== undefined;

  return (
    <Group gap={4} wrap="nowrap">
      <Tooltip label="Copy details" withArrow>
        <ActionIcon
          variant="subtle"
          size="sm"
          aria-label={`Copy details ${props.backup.id}`}
          disabled={itemDisabled(menuEntries, "copy-details")}
          onClick={() => props.onCopyDetails(props.backup)}
        >
          <ClipboardText size={16} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label={props.backup.path} multiline maw={360} withArrow>
        <ActionIcon
          variant="subtle"
          size="sm"
          aria-label={`Open folder ${props.backup.path}`}
          disabled={itemDisabled(menuEntries, "open-folder")}
          onClick={() => props.onOpenFolder(props.backup.id)}
        >
          <FolderOpen size={16} />
        </ActionIcon>
      </Tooltip>
      <Tooltip
        label={props.backup.diskMissing ? "Archive missing on disk — export blocked" : "Export a copy"}
        withArrow
      >
        <ActionIcon
          variant="subtle"
          size="sm"
          aria-label={`Export backup ${props.backup.id}`}
          disabled={itemDisabled(menuEntries, "export")}
          onClick={() => props.onExport(props.backup)}
        >
          <Export size={16} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label={props.backup.diskMissing ? "Archive missing on disk — restore blocked" : "Restore"} withArrow>
        <ActionIcon
          variant="subtle"
          color="attention"
          size="sm"
          aria-label={`Restore backup ${props.backup.id}`}
          disabled={itemDisabled(menuEntries, "restore")}
          onClick={() => props.onRestore(props.backup)}
        >
          <ArrowCounterClockwise size={16} />
        </ActionIcon>
      </Tooltip>
      {showProtect && (
        <BackupProtectionPopover
          backup={props.backup}
          busy={props.busy}
          saving={props.protectionSaving === true}
          onSave={props.onSaveProtection!}
        />
      )}
      <Tooltip label="Delete" withArrow>
        <ActionIcon
          variant="subtle"
          color="red"
          size="sm"
          aria-label={`Delete backup ${props.backup.id}`}
          disabled={itemDisabled(menuEntries, "delete")}
          onClick={() => props.onDelete(props.backup)}
        >
          <Trash size={16} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}
