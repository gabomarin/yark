import type { ReactElement } from "react";
import { Button, Group, Text, VisuallyHidden } from "@mantine/core";
import { AddServerSplitButton } from "@features/servers/components/AddServerSplitButton/AddServerSplitButton";
import {
  formatCpuPercent,
  formatWorkingSet,
} from "@features/servers/model/serverCardProcessMeta";
import classes from "../OverviewPage.module.css";

interface Props {
  onCreateServer: () => void;
  onImportServer: () => void;
  onCheckUpdates: () => void;
  onCheckInstalls: () => void;
  onUpdateAllOutdated?: () => void;
  checkingUpdates?: boolean;
  checkingInstalls?: boolean;
  canUpdateAllOutdated?: boolean;
  openingUpdateAllOutdated?: boolean;
  /** Known online survivors across running servers; `null` until a real RCON sample exists. */
  survivorsOnlineTotal?: number | null;
  /**
   * When false (no starting/running enabled server), hide header RAM / CPU (#302).
   */
  showProcessFleetMetrics?: boolean;
  /** Sum of working set on starting/running servers; `null` until a real sample exists (#302). */
  fleetRamBytes?: number | null;
  /** Sum of per-process CPU % (one logical processor each) (#302). */
  fleetCpuPercent?: number | null;
}

export function OverviewHeader({
  onCreateServer,
  onImportServer,
  onCheckUpdates,
  onCheckInstalls,
  onUpdateAllOutdated,
  checkingUpdates = false,
  checkingInstalls = false,
  canUpdateAllOutdated = false,
  openingUpdateAllOutdated = false,
  survivorsOnlineTotal = null,
  showProcessFleetMetrics = false,
  fleetRamBytes = null,
  fleetCpuPercent = null,
}: Props): ReactElement {
  const survivorsLabel =
    survivorsOnlineTotal == null
      ? "Survivors –"
      : survivorsOnlineTotal === 1
        ? "1 survivor online"
        : `${survivorsOnlineTotal} survivors online`;
  const ramLabel =
    fleetRamBytes == null ? "RAM –" : `RAM ${formatWorkingSet(fleetRamBytes)}`;
  const cpuLabel =
    fleetCpuPercent == null ? "CPU –" : `CPU ${formatCpuPercent(fleetCpuPercent)}`;

  return (
    <header className={classes.header}>
      <h1 className={classes.title}>Servers</h1>
      <Group gap="md" wrap="wrap" justify="flex-end" className={classes.headerActions}>
        <Group gap="sm" wrap="wrap" className={classes.fleetReadouts}>
          <Text
            size="sm"
            c="dimmed"
            className={classes.fleetReadout}
            data-survivors-online={
              survivorsOnlineTotal == null ? undefined : survivorsOnlineTotal
            }
          >
            {survivorsLabel}
          </Text>
          {showProcessFleetMetrics ? (
            <>
              <Text
                size="sm"
                c="dimmed"
                className={classes.fleetReadout}
                data-fleet-ram={fleetRamBytes == null ? undefined : fleetRamBytes}
                title="Sum of dedicated-process working set on starting/running servers"
              >
                {ramLabel}
              </Text>
              <Text
                size="sm"
                c="dimmed"
                className={classes.fleetReadout}
                data-fleet-cpu={
                  fleetCpuPercent == null ? undefined : fleetCpuPercent
                }
                title="Sum of dedicated-process CPU % (each % of one logical processor)"
              >
                {cpuLabel}
              </Text>
            </>
          ) : null}
        </Group>
        <Button
          variant="transparent"
          color="gray"
          classNames={{
            root: classes.headerActionButton,
            label: classes.headerActionButtonLabel,
          }}
          onClick={onCheckInstalls}
          loading={checkingInstalls}
          data-install-health-scan={checkingInstalls || undefined}
          aria-busy={checkingInstalls || undefined}
        >
          {checkingInstalls ? "Checking servers health…" : "Check Servers Health"}
        </Button>
        {checkingInstalls ? (
          <VisuallyHidden
            component="span"
            role="status"
            aria-live="polite"
          >
            Checking servers health…
          </VisuallyHidden>
        ) : null}
        <Button
          variant="transparent"
          color="gray"
          classNames={{
            root: classes.headerActionButton,
            label: classes.headerActionButtonLabel,
          }}
          onClick={onCheckUpdates}
          loading={checkingUpdates}
        >
          Check server updates
        </Button>
        {onUpdateAllOutdated !== undefined ? (
          <Button
            variant="transparent"
            color="gray"
            classNames={{
              root: classes.headerActionButton,
              label: classes.headerActionButtonLabel,
            }}
            onClick={onUpdateAllOutdated}
            disabled={!canUpdateAllOutdated || openingUpdateAllOutdated}
            loading={openingUpdateAllOutdated}
          >
            Update All
          </Button>
        ) : null}
        <AddServerSplitButton
          primaryLabel="New server"
          onCreate={onCreateServer}
          onImport={onImportServer}
          menuAriaLabel="More new-server options"
        />
      </Group>
    </header>
  );
}
