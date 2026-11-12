import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import { Modal } from "@mantine/core";
import type { BackupRecord } from "@shared/types";
import { BackupProtectionEditor } from "../BackupProtectionEditor/BackupProtectionEditor";

interface Props {
  backup: BackupRecord | null;
  saving: boolean;
  onClose: () => void;
  onSave: (backup: BackupRecord, isProtected: boolean, operatorNote: string) => Promise<boolean>;
}

/** Context-menu path for editing backup protection (popover is used from the shield icon). */
export function BackupProtectionModal(props: Props): ReactElement {
  const [isProtected, setIsProtected] = useState(false);
  const [operatorNote, setOperatorNote] = useState("");
  const [dirty, setDirty] = useState(false);
  const lastSyncedRef = useRef<{ id: string; isProtected: boolean; operatorNote: string } | null>(null);

  useEffect(() => {
    if (props.backup === null) {
      setDirty(false);
      lastSyncedRef.current = null;
      return;
    }
    const sameId = lastSyncedRef.current?.id === props.backup.id;
    if (!sameId) {
      setIsProtected(props.backup.isProtected);
      setOperatorNote(props.backup.operatorNote);
      setDirty(false);
      lastSyncedRef.current = {
        id: props.backup.id,
        isProtected: props.backup.isProtected,
        operatorNote: props.backup.operatorNote,
      };
      return;
    }
    if (dirty) return;
    if (
      props.backup.isProtected === lastSyncedRef.current?.isProtected &&
      props.backup.operatorNote === lastSyncedRef.current.operatorNote
    ) {
      return;
    }
    setIsProtected(props.backup.isProtected);
    setOperatorNote(props.backup.operatorNote);
    lastSyncedRef.current = {
      id: props.backup.id,
      isProtected: props.backup.isProtected,
      operatorNote: props.backup.operatorNote,
    };
  }, [props.backup, dirty]);

  return (
    <Modal
      opened={props.backup !== null}
      onClose={props.onClose}
      title="Protect backup"
      centered
      closeOnClickOutside={!props.saving}
      closeOnEscape={!props.saving}
    >
      {props.backup !== null && (
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
          onCancel={props.onClose}
          onSave={async () => {
            if (props.backup === null) return;
            const ok = await props.onSave(props.backup, isProtected, operatorNote);
            if (ok) setDirty(false);
          }}
        />
      )}
    </Modal>
  );
}
