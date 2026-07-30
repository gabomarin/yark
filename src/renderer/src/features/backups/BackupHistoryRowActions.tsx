import type { ReactElement } from "react";
import { ClipboardText, FolderOpen, ArrowCounterClockwise } from "@phosphor-icons/react";
import { ActionIcon, Group, Tooltip } from "@mantine/core";
import type { BackupRecord } from "@shared/types";

interface Props {
  backup: BackupRecord;
  busy: boolean;
  opsLocked: boolean;
  onCopyDetails: (backup: BackupRecord) => void;
  onOpenFolder: (backupId: string) => void;
  onRestore: (backup: BackupRecord) => void;
}

export function BackupHistoryRowActions(props: Props): ReactElement {
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
    </Group>
  );
}
