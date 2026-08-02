import type { ReactElement } from "react";
import { ArrowsClockwise, HardDrives, Plus } from "@phosphor-icons/react";
import { Button, Group } from "@mantine/core";
import classes from "../OverviewPage.module.css";

interface Props {
  onCreateServer: () => void;
  onCheckUpdates: () => void;
  onCheckInstalls: () => void;
  checkingUpdates?: boolean;
  checkingInstalls?: boolean;
}

export function OverviewHeader({
  onCreateServer,
  onCheckUpdates,
  onCheckInstalls,
  checkingUpdates = false,
  checkingInstalls = false,
}: Props): ReactElement {
  return (
    <header className={classes.header}>
      <div>
        <h1 className={classes.title}>Servers</h1>
        <p className={classes.subtitle}>Monitor and manage all your ARK servers</p>
      </div>
      <Group gap="sm" wrap="wrap" justify="flex-end" className={classes.headerActions}>
        <Button
          variant="subtle"
          color="gray"
          leftSection={<HardDrives size={16} />}
          onClick={onCheckInstalls}
          loading={checkingInstalls}
        >
          Check installs
        </Button>
        <Button
          variant="subtle"
          color="gray"
          leftSection={<ArrowsClockwise size={16} />}
          onClick={onCheckUpdates}
          loading={checkingUpdates}
        >
          Check for updates
        </Button>
        <Button leftSection={<Plus size={16} />} onClick={onCreateServer}>
          New server
        </Button>
      </Group>
    </header>
  );
}
