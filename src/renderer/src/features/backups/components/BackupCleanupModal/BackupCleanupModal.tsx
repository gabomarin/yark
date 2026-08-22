import type { ReactElement } from "react";
import {
  Button,
  Checkbox,
  Group,
  Modal,
  NumberInput,
  Stack,
  Text,
} from "@mantine/core";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";
import type { BackupCleanupOptions, BackupCleanupPreview } from "@shared/types";
import { formatBackupBytes } from "../../backupsPageModel";
import classes from "../../BackupsPage.module.css";

interface Props {
  opened: boolean;
  busy: boolean;
  onClose: () => void;
  cleanupOptions: BackupCleanupOptions;
  onCleanupOptionsChange: (
    updater: (prev: BackupCleanupOptions) => BackupCleanupOptions,
  ) => void;
  olderThanEnabled: boolean;
  onOlderThanEnabledChange: (enabled: boolean) => void;
  olderThanDays: number;
  onOlderThanDaysChange: (days: number) => void;
  keepLastEnabled: boolean;
  onKeepLastEnabledChange: (enabled: boolean) => void;
  keepLastPerKind: number;
  onKeepLastPerKindChange: (count: number) => void;
  cleanupPreview: BackupCleanupPreview | null;
  onClearPreview: () => void;
  onPreview: () => void;
  onConfirm: () => void;
}

export function BackupCleanupModal(props: Props): ReactElement {
  return (
    <Modal
      opened={props.opened}
      onClose={() => !props.busy && props.onClose()}
      title="Cleanup backups"
      size="lg"
      centered
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Finds backups that match your rules. The newest successful world
          backup per server is kept by default.
        </Text>
        <Checkbox
          label="Delete failed backups"
          checked={props.cleanupOptions.includeFailed}
          onChange={(event) => {
            props.onClearPreview();
            props.onCleanupOptionsChange((prev) => ({
              ...prev,
              includeFailed: event.currentTarget.checked,
            }));
          }}
        />
        <Checkbox
          label="Delete older backups past each server's keep limit"
          checked={props.cleanupOptions.enforceRetention}
          onChange={(event) => {
            props.onClearPreview();
            props.onCleanupOptionsChange((prev) => ({
              ...prev,
              enforceRetention: event.currentTarget.checked,
            }));
          }}
        />
        <Group align="center" gap="sm">
          <Checkbox
            label="Older than"
            checked={props.olderThanEnabled}
            onChange={(event) => {
              props.onClearPreview();
              props.onOlderThanEnabledChange(event.currentTarget.checked);
            }}
          />
          <NumberInput
            min={1}
            max={3650}
            value={props.olderThanDays}
            disabled={!props.olderThanEnabled}
            onChange={(value) => {
              if (typeof value === "number") {
                props.onClearPreview();
                props.onOlderThanDaysChange(value);
              }
            }}
            w={90}
          />
          <Text size="sm">days</Text>
        </Group>
        <Group align="center" gap="sm">
          <Checkbox
            label="Keep only last"
            checked={props.keepLastEnabled}
            onChange={(event) => {
              props.onClearPreview();
              props.onKeepLastEnabledChange(event.currentTarget.checked);
            }}
          />
          <NumberInput
            min={1}
            max={500}
            value={props.keepLastPerKind}
            disabled={!props.keepLastEnabled}
            onChange={(value) => {
              if (typeof value === "number") {
                props.onClearPreview();
                props.onKeepLastPerKindChange(value);
              }
            }}
            w={90}
          />
          <Text size="sm">per kind (per player for profiles)</Text>
        </Group>
        <Checkbox
          label="Protect newest successful world backup per server"
          checked={props.cleanupOptions.protectNewestWorld}
          onChange={(event) => {
            props.onClearPreview();
            props.onCleanupOptionsChange((prev) => ({
              ...prev,
              protectNewestWorld: event.currentTarget.checked,
            }));
          }}
        />

        {props.cleanupPreview !== null && (
          <AppSurfaceCard
            tone="flat"
            padding="sm"
            radius="md"
            className={classes.cleanupPreview}
          >
            {props.cleanupPreview.items.length === 0 ? (
              <Text size="sm" c="dimmed">
                Nothing matches these rules.
              </Text>
            ) : (
              <Stack gap="xs">
                <Text size="sm" fw={600}>
                  Will delete {props.cleanupPreview.items.length} backup
                  {props.cleanupPreview.items.length === 1 ? "" : "s"} ·{" "}
                  {formatBackupBytes(props.cleanupPreview.totalBytes)}
                </Text>
                {props.cleanupPreview.byServer.map((row) => (
                  <Text key={row.serverId} size="sm" c="dimmed">
                    {row.serverName}: {row.count} · {formatBackupBytes(row.bytes)}
                  </Text>
                ))}
              </Stack>
            )}
          </AppSurfaceCard>
        )}

        <Group justify="flex-end">
          <Button
            variant="default"
            disabled={props.busy}
            onClick={props.onClose}
          >
            Cancel
          </Button>
          {props.cleanupPreview !== null && props.cleanupPreview.items.length > 0 ? (
            <Button
              color="red"
              variant="filled"
              loading={props.busy}
              onClick={props.onConfirm}
            >
              Remove {props.cleanupPreview.items.length}
            </Button>
          ) : (
            <Button
              variant="light"
              loading={props.busy}
              onClick={props.onPreview}
            >
              Scan
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  );
}
