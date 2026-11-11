import type { ReactElement } from "react";
import { useEffect, useState } from "react";
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

  useEffect(() => {
    if (props.backup === null) return;
    setIsProtected(props.backup.isProtected);
    setOperatorNote(props.backup.operatorNote);
  }, [props.backup]);

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
          onIsProtectedChange={setIsProtected}
          onOperatorNoteChange={setOperatorNote}
          onCancel={props.onClose}
          onSave={async () => {
            if (props.backup === null) return;
            await props.onSave(props.backup, isProtected, operatorNote);
          }}
        />
      )}
    </Modal>
  );
}
