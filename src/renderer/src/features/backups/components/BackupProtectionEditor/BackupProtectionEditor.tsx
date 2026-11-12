import type { ReactElement } from "react";
import { Button, Group, Stack, Text, Textarea, Tooltip } from "@mantine/core";
import { BACKUP_OPERATOR_NOTE_MAX_LENGTH } from "@shared/types";
import { AppSwitch } from "@ui/AppSwitch/AppSwitch";
import { BACKUP_PROTECT_HELP_TOOLTIP } from "../../model/serverBackupPanelModel";
import classes from "../../BackupsPage.module.css";

export interface BackupProtectionEditorProps {
  isProtected: boolean;
  operatorNote: string;
  saving: boolean;
  onIsProtectedChange: (value: boolean) => void;
  onOperatorNoteChange: (value: string) => void;
  onSave: () => void | Promise<void>;
  onCancel?: () => void;
}

/**
 * Shared Protect switch + optional operator note for history popover / modal.
 */
export function BackupProtectionEditor(props: BackupProtectionEditorProps): ReactElement {
  return (
    <Stack gap="sm">
      <Tooltip label={BACKUP_PROTECT_HELP_TOOLTIP} multiline maw={320} withArrow>
        <span className={classes.protectSwitchHit}>
          <AppSwitch
            label="Protected"
            checked={props.isProtected}
            disabled={props.saving}
            onCheckedChange={props.onIsProtectedChange}
          />
        </span>
      </Tooltip>
      <Textarea
        label="Note"
        description="Optional note (kept if you turn Protect off)."
        placeholder="Why this archive should stay…"
        minRows={3}
        maxLength={BACKUP_OPERATOR_NOTE_MAX_LENGTH}
        value={props.operatorNote}
        disabled={props.saving || !props.isProtected}
        onChange={(event) => props.onOperatorNoteChange(event.currentTarget.value)}
      />
      <Text size="xs" c="dimmed">
        {props.operatorNote.length}/{BACKUP_OPERATOR_NOTE_MAX_LENGTH}
      </Text>
      <Group justify="flex-end" gap="xs">
        {props.onCancel !== undefined && (
          <Button variant="default" size="xs" disabled={props.saving} onClick={props.onCancel}>
            Cancel
          </Button>
        )}
        <Button
          size="xs"
          loading={props.saving}
          onClick={() => {
            void props.onSave();
          }}
        >
          Save
        </Button>
      </Group>
    </Stack>
  );
}
