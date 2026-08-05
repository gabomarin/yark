import type { ReactElement } from "react";
import {
  ArrowCounterClockwise,
  ClipboardText,
  Export,
  FolderOpen,
  Trash,
} from "@phosphor-icons/react";
import { ActionIcon, Group, Tooltip } from "@mantine/core";
import type { BackupRecord } from "@shared/types";

interface Props {
  backup: BackupRecord;
  busy: boolean;
  opsLocked: boolean;
  onCopyDetails: (backup: BackupRecord) => void;
  onOpenFolder: (backupId: string) => void;
  onExport: (backup: BackupRecord) => void;
  onRestore: (backup: BackupRecord) => void;
  onDelete: (backup: BackupRecord) => void;
}

export function BackupHistoryRowActions(props: Props): ReactElement {
  const canMutate = props.backup.status !== "running";
  return (
    <Group gap={4}>
      <Tooltip label="Copy details" withArrow>
        <ActionIcon
          variant="subtle"
          size="sm"
          aria-label={`Copy details ${props.backup.id}`}
          disabled={props.busy}
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
          disabled={props.busy}
          onClick={() => props.onOpenFolder(props.backup.id)}
        >
          <FolderOpen size={16} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Export a copy" withArrow>
        <ActionIcon
          variant="subtle"
          size="sm"
          aria-label={`Export backup ${props.backup.id}`}
          disabled={props.busy || props.backup.status !== "completed"}
          onClick={() => props.onExport(props.backup)}
        >
          <Export size={16} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Restore" withArrow>
        <ActionIcon
          variant="light"
          color="orange"
          size="sm"
          aria-label={`Restore backup ${props.backup.id}`}
          disabled={
            props.busy
            || props.backup.status !== "completed"
            || props.opsLocked
          }
          onClick={() => props.onRestore(props.backup)}
        >
          <ArrowCounterClockwise size={16} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Delete" withArrow>
        <ActionIcon
          variant="subtle"
          color="red"
          size="sm"
          aria-label={`Delete backup ${props.backup.id}`}
          disabled={props.busy || !canMutate}
          onClick={() => props.onDelete(props.backup)}
        >
          <Trash size={16} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}
