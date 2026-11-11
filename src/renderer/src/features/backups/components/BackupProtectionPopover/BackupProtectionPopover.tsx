import type { ReactElement } from "react";
import { useState } from "react";
import { Shield } from "@phosphor-icons/react";
import { ActionIcon, Popover, Tooltip } from "@mantine/core";
import type { BackupRecord } from "@shared/types";
import { BackupProtectionEditor } from "../BackupProtectionEditor/BackupProtectionEditor";

interface Props {
  backup: BackupRecord;
  busy: boolean;
  saving: boolean;
  onSave: (backup: BackupRecord, isProtected: boolean, operatorNote: string) => Promise<boolean>;
}

export function BackupProtectionPopover(props: Props): ReactElement {
  const [opened, setOpened] = useState(false);
  const [isProtected, setIsProtected] = useState(props.backup.isProtected);
  const [operatorNote, setOperatorNote] = useState(props.backup.operatorNote);

  const tooltip = props.backup.operatorNote.trim().length > 0 ? props.backup.operatorNote.trim() : "Protected";

  return (
    <Popover
      opened={opened}
      onChange={(next) => {
        if (props.saving) return;
        setOpened(next);
        if (next) {
          setIsProtected(props.backup.isProtected);
          setOperatorNote(props.backup.operatorNote);
        }
      }}
      position="bottom-end"
      withArrow
      shadow="md"
      width={320}
    >
      <Popover.Target>
        <Tooltip label={props.backup.isProtected ? tooltip : "Protect"} multiline maw={320} withArrow disabled={opened}>
          <ActionIcon
            variant="subtle"
            color={props.backup.isProtected ? "blue" : "gray"}
            size="sm"
            aria-label={
              props.backup.isProtected ? `Edit protection ${props.backup.id}` : `Protect backup ${props.backup.id}`
            }
            disabled={props.busy || props.backup.status !== "completed"}
            onClick={() => {
              setIsProtected(props.backup.isProtected);
              setOperatorNote(props.backup.operatorNote);
              setOpened((current) => !current);
            }}
          >
            <Shield size={16} weight={props.backup.isProtected ? "fill" : "regular"} />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown>
        <BackupProtectionEditor
          isProtected={isProtected}
          operatorNote={operatorNote}
          saving={props.saving}
          onIsProtectedChange={setIsProtected}
          onOperatorNoteChange={setOperatorNote}
          onCancel={() => setOpened(false)}
          onSave={async () => {
            const ok = await props.onSave(props.backup, isProtected, operatorNote);
            if (ok) setOpened(false);
          }}
        />
      </Popover.Dropdown>
    </Popover>
  );
}
