import type { ReactElement } from "react";
import { Group, Stack, Text, Title } from "@mantine/core";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";
import type { BackupDiskAlertSettings, BackupFleetSummary } from "@shared/types";
import { formatBackupBytes } from "../../backupsPageModel";
import classes from "../../BackupsPage.module.css";

interface Props {
  disks: BackupFleetSummary["disks"];
  diskSettings: BackupDiskAlertSettings;
}

export function BackupVolumeStrip(props: Props): ReactElement {
  return (
    <Stack gap="xs">
      <Group justify="space-between" align="center">
        <Title order={5}>Volumes</Title>
        <Text size="xs" c="dimmed">
          Thresholds apply per drive. Click Disk free to edit.
        </Text>
      </Group>
      <div className={classes.volumeStrip}>
        {props.disks.map((disk) => {
          const critical =
            disk.usedPercent != null &&
            disk.usedPercent >= props.diskSettings.criticalUsedPercent;
          const warning =
            !critical &&
            ((disk.usedPercent != null &&
              disk.usedPercent >= props.diskSettings.warnUsedPercent) ||
              (disk.freeBytes != null &&
                disk.freeBytes < props.diskSettings.warnFreeBytes));
          return (
            <AppSurfaceCard
              key={disk.volumePath}
              tone="flat"
              padding="sm"
              radius="md"
              className={[
                classes.volumeCard,
                critical ? classes.statDanger : "",
                warning ? classes.statWarning : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <Text fw={600} size="sm">
                {disk.volumePath}
              </Text>
              <Text size="xs" c="dimmed">
                Free {formatBackupBytes(disk.freeBytes)}
                {disk.usedPercent != null
                  ? ` · ${disk.usedPercent.toFixed(0)}% used`
                  : ""}
              </Text>
              <Text size="xs" c="dimmed">
                Backups on this volume: {formatBackupBytes(disk.backupBytes)}
                {disk.roots.length > 1
                  ? ` · ${disk.roots.length} destinations`
                  : ""}
              </Text>
            </AppSurfaceCard>
          );
        })}
      </div>
    </Stack>
  );
}
