import type { ReactElement } from "react";
import { Button, Checkbox, Group, Modal, Stack, Text } from "@mantine/core";
import { backupFinishedAt } from "@shared/backup-player-meta";
import { formatLogDateTime } from "@shared/format-log-datetime";
import type { BackupRecord } from "@shared/types";

function formatWhen(iso: string): string {
  return formatLogDateTime(iso, { fallback: iso });
}

function kindLabel(kind: BackupRecord["kind"]): string {
  if (kind === "world") return "World save";
  if (kind === "players") return "Player profiles";
  return "INI";
}

interface Props {
  backup: BackupRecord | null;
  serverName: string;
  serverMap: string;
  restoreProfilesTribes: boolean;
  busy: boolean;
  onRestoreProfilesTribesChange: (value: boolean) => void;
  onClose: () => void;
  onConfirm: () => void;
}

/** Confirm restore for any backup kind; world offers profiles/tribes overlay toggle. */
export function BackupRestoreModal(props: Props): ReactElement {
  const backup = props.backup;
  return (
    <Modal
      opened={backup !== null}
      onClose={props.onClose}
      title="Restore backup?"
      centered
    >
      {backup !== null ? (
        <Stack gap="md">
          {backup.kind === "world" ? (
            <>
              <Text size="sm">
                Overlay map{" "}
                <strong>{backup.mapToken ?? props.serverMap}</strong> from{" "}
                {formatWhen(backupFinishedAt(backup))} onto{" "}
                <strong>{props.serverName}</strong>. Other map folders under
                SavedArks stay untouched. A safety world backup is created first.
                The server must stay stopped.
              </Text>
              <Checkbox
                label="Restore player profiles / tribes"
                checked={props.restoreProfilesTribes}
                onChange={(event) =>
                  props.onRestoreProfilesTribesChange(event.currentTarget.checked)
                }
              />
            </>
          ) : (
            <Text size="sm">
              Restore <strong>{kindLabel(backup.kind)}</strong> from{" "}
              {formatWhen(backupFinishedAt(backup))} onto{" "}
              <strong>{props.serverName}</strong>? Only that kind of data is
              replaced. A safety backup of the same kind is created first. The
              server must stay stopped.
            </Text>
          )}
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={props.onClose} disabled={props.busy}>
              Cancel
            </Button>
            <Button color="orange" onClick={props.onConfirm} loading={props.busy}>
              Restore
            </Button>
          </Group>
        </Stack>
      ) : null}
    </Modal>
  );
}
