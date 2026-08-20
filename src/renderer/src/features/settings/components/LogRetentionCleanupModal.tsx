import type { ReactElement } from "react";
import { Button, Group, Modal, Stack, Text } from "@mantine/core";
import type { LogCleanupPreview } from "@shared/types";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

interface Props {
  opened: boolean;
  busy: boolean;
  preview: LogCleanupPreview | null;
  onClose: () => void;
  onScan: () => void;
  onConfirm: () => void;
}

export function LogRetentionCleanupModal(props: Props): ReactElement {
  const canRemove =
    props.preview !== null && props.preview.items.length > 0;

  return (
    <Modal
      opened={props.opened}
      onClose={() => !props.busy && props.onClose()}
      title="Clean up old logs"
      size="lg"
      centered
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Finds outdated YARK events and update logs based on your retention
          limits. ASA server console logs are not touched.
        </Text>

        {props.preview !== null && (
          <AppSurfaceCard tone="flat" padding="sm" radius="md">
            {props.preview.items.length === 0 ? (
              <Text size="sm" c="dimmed">
                Nothing is old enough to remove yet.
              </Text>
            ) : (
              <Stack gap="xs">
                <Text size="sm" fw={600}>
                  Will remove {props.preview.items.length} item
                  {props.preview.items.length === 1 ? "" : "s"}
                  {props.preview.totalBytes > 0
                    ? ` · ${formatBytes(props.preview.totalBytes)}`
                    : ""}
                </Text>
                {props.preview.byCategory
                  .filter((row) => row.count > 0)
                  .map((row) => (
                    <Text key={row.category} size="xs" c="dimmed">
                      {row.category === "events" ? "Events" : "Update logs"}:{" "}
                      {row.count}
                      {row.bytes > 0 ? ` · ${formatBytes(row.bytes)}` : ""}
                    </Text>
                  ))}
                {props.preview.byServer.map((row) => (
                  <Text key={row.serverId || "global"} size="xs" c="dimmed">
                    {row.serverName}: {row.count}
                    {row.bytes > 0 ? ` · ${formatBytes(row.bytes)}` : ""}
                  </Text>
                ))}
              </Stack>
            )}
          </AppSurfaceCard>
        )}

        <Group justify="flex-end" gap="sm">
          <Button
            variant="default"
            disabled={props.busy}
            onClick={props.onClose}
          >
            Cancel
          </Button>
          {canRemove ? (
            <Button
              color="red"
              variant="filled"
              loading={props.busy}
              onClick={props.onConfirm}
            >
              Remove {props.preview!.items.length}
            </Button>
          ) : (
            <Button
              variant="light"
              loading={props.busy}
              onClick={props.onScan}
            >
              Scan
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  );
}
