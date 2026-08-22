import type { ReactElement } from "react";
import { Button, Group, Modal, NumberInput, Stack, Text } from "@mantine/core";
import type { BackupDiskAlertSettings } from "@shared/types";

interface Props {
  opened: boolean;
  onClose: () => void;
  diskDraft: BackupDiskAlertSettings | null;
  onDiskDraftChange: (draft: BackupDiskAlertSettings) => void;
  busy: boolean;
  onSave: () => void;
}

export function BackupDiskAlertModal(props: Props): ReactElement {
  return (
    <Modal
      opened={props.opened}
      onClose={props.onClose}
      title="Warn me when the backup drive fills up"
      centered
    >
      {props.diskDraft !== null && (
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Based on the whole drive, not just the backup folder. Warning and
            critical percentages apply to total used space.
          </Text>
          <NumberInput
            label="Warning at used %"
            min={50}
            max={99}
            value={props.diskDraft.warnUsedPercent}
            onChange={(value) =>
              typeof value === "number" &&
              props.onDiskDraftChange({ ...props.diskDraft!, warnUsedPercent: value })
            }
          />
          <NumberInput
            label="Critical at used %"
            min={51}
            max={100}
            value={props.diskDraft.criticalUsedPercent}
            onChange={(value) =>
              typeof value === "number" &&
              props.onDiskDraftChange({
                ...props.diskDraft!,
                criticalUsedPercent: value,
              })
            }
          />
          <NumberInput
            label="Also warn if free space below (GB)"
            min={1}
            max={1024}
            value={Math.round(props.diskDraft.warnFreeBytes / 1024 ** 3)}
            onChange={(value) =>
              typeof value === "number" &&
              props.onDiskDraftChange({
                ...props.diskDraft!,
                warnFreeBytes: value * 1024 ** 3,
              })
            }
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={props.onClose}>
              Cancel
            </Button>
            <Button loading={props.busy} onClick={props.onSave}>
              Save thresholds
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
