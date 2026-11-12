import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
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
  const [dirty, setDirty] = useState(false);
  const lastSyncedRef = useRef({
    isProtected: props.backup.isProtected,
    operatorNote: props.backup.operatorNote,
  });

  useEffect(() => {
    if (!opened || dirty) return;
    if (
      props.backup.isProtected === lastSyncedRef.current.isProtected &&
      props.backup.operatorNote === lastSyncedRef.current.operatorNote
    ) {
      return;
    }
    setIsProtected(props.backup.isProtected);
    setOperatorNote(props.backup.operatorNote);
    lastSyncedRef.current = {
      isProtected: props.backup.isProtected,
      operatorNote: props.backup.operatorNote,
    };
  }, [opened, dirty, props.backup.isProtected, props.backup.operatorNote]);

  const resetFromBackup = () => {
    setIsProtected(props.backup.isProtected);
    setOperatorNote(props.backup.operatorNote);
    setDirty(false);
    lastSyncedRef.current = {
      isProtected: props.backup.isProtected,
      operatorNote: props.backup.operatorNote,
    };
  };

  const tooltip = props.backup.operatorNote.trim().length > 0 ? props.backup.operatorNote.trim() : "Protected";

  return (
    <Popover
      opened={opened}
      onChange={(next) => {
        if (props.saving) return;
        setOpened(next);
        if (next) resetFromBackup();
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
            disabled={props.busy || props.backup.status !== "completed" || props.backup.diskMissing}
            onClick={() => {
              resetFromBackup();
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
          onIsProtectedChange={(value) => {
            setDirty(true);
            setIsProtected(value);
          }}
          onOperatorNoteChange={(value) => {
            setDirty(true);
            setOperatorNote(value);
          }}
          onCancel={() => setOpened(false)}
          onSave={async () => {
            const ok = await props.onSave(props.backup, isProtected, operatorNote);
            if (ok) {
              setDirty(false);
              setOpened(false);
            }
          }}
        />
      </Popover.Dropdown>
    </Popover>
  );
}
