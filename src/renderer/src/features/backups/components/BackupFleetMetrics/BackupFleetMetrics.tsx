import type { ReactElement } from "react";
import { Group, SimpleGrid, Text } from "@mantine/core";
import { AppMetricCard, type AppMetricTone } from "@ui/AppMetricCard/AppMetricCard";
import type { BackupFleetSummary } from "@shared/types";
import classes from "./BackupFleetMetrics.module.css";

type BackupHealthFilter = "all" | "at_risk" | "failed" | "protected";

interface Props {
  summary: BackupFleetSummary;
  quiet: boolean;
  healthFilter: BackupHealthFilter;
  onHealthFilter: (
    next: BackupHealthFilter | ((prev: BackupHealthFilter) => BackupHealthFilter),
  ) => void;
  onOpenDiskSettings: () => void;
}

function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return "–";
  const abs = Math.abs(bytes);
  if (abs >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (abs >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (abs >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${Math.round(bytes)} B`;
}

function worstDiskOf(summary: BackupFleetSummary): BackupFleetSummary["disks"][number] | null {
  if (summary.disks.length === 0) return null;
  return [...summary.disks].sort(
    (a, b) => (b.usedPercent ?? -1) - (a.usedPercent ?? -1),
  )[0] ?? null;
}

function diskTone(
  summary: BackupFleetSummary,
  disk: BackupFleetSummary["disks"][number] | null,
): AppMetricTone {
  if (disk == null) return "default";
  if (
    disk.usedPercent != null &&
    disk.usedPercent >= summary.diskSettings.criticalUsedPercent
  ) {
    return "danger";
  }
  if (
    (disk.usedPercent != null && disk.usedPercent >= summary.diskSettings.warnUsedPercent) ||
    (disk.freeBytes != null && disk.freeBytes < summary.diskSettings.warnFreeBytes)
  ) {
    return "warning";
  }
  return "default";
}

function DiskFreeCard(props: {
  summary: BackupFleetSummary;
  onOpenDiskSettings: () => void;
}): ReactElement {
  const disk = worstDiskOf(props.summary);
  const hint =
    props.summary.disks.length > 1
      ? disk != null
        ? `Tightest: ${disk.volumePath} · ${props.summary.disks.length} volumes`
        : `${props.summary.disks.length} volumes`
      : disk?.usedPercent != null
        ? `${disk.volumePath} · ${disk.usedPercent.toFixed(0)}% used`
        : disk?.volumePath;

  return (
    <AppMetricCard
      label="Disk free"
      value={disk?.freeBytes != null ? formatBytes(disk.freeBytes) : "–"}
      hint={hint}
      tone={diskTone(props.summary, disk)}
      progressPercent={disk?.usedPercent ?? null}
      onClick={props.onOpenDiskSettings}
    />
  );
}

export function BackupFleetMetrics(props: Props): ReactElement {
  if (props.quiet) {
    return (
      <Group align="flex-end" justify="space-between" gap="md" wrap="wrap">
        <Text size="sm" c="dimmed" maw={420} data-backup-fleet-quiet>
          No backups yet. Create and restore from each server’s Backups tab.
        </Text>
        <SimpleGrid cols={1} spacing="sm" className={classes.quietDiskMetric}>
          <DiskFreeCard
            summary={props.summary}
            onOpenDiskSettings={props.onOpenDiskSettings}
          />
        </SimpleGrid>
      </Group>
    );
  }

  return (
    <SimpleGrid cols={{ base: 2, sm: 3, lg: 5 }} spacing="xs">
      <AppMetricCard
        label="Protected"
        value={`${props.summary.stats.protectedCount}/${props.summary.servers.length}`}
        active={props.healthFilter === "protected"}
        onClick={() =>
          props.onHealthFilter((prev) => (prev === "protected" ? "all" : "protected"))
        }
      />
      <AppMetricCard
        label="At risk"
        value={String(props.summary.stats.atRiskCount)}
        tone={props.summary.stats.atRiskCount > 0 ? "warning" : "default"}
        active={props.healthFilter === "at_risk"}
        onClick={() =>
          props.onHealthFilter((prev) => (prev === "at_risk" ? "all" : "at_risk"))
        }
      />
      <AppMetricCard
        label="Failed (24h)"
        value={String(props.summary.stats.failed24h)}
        tone={props.summary.stats.failed24h > 0 ? "danger" : "default"}
        active={props.healthFilter === "failed"}
        onClick={() =>
          props.onHealthFilter((prev) => (prev === "failed" ? "all" : "failed"))
        }
      />
      <AppMetricCard
        label="Backup used"
        value={formatBytes(props.summary.stats.totalBackupBytes)}
      />
      <DiskFreeCard
        summary={props.summary}
        onOpenDiskSettings={props.onOpenDiskSettings}
      />
    </SimpleGrid>
  );
}
