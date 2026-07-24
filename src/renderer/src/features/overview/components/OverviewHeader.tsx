import { ArrowsClockwise, Plus } from "@phosphor-icons/react";
import { Button, Group } from "@mantine/core";
import classes from "../OverviewPage.module.css";

interface Props {
  onCreateServer: () => void;
  onCheckUpdates: () => void;
  checkingUpdates?: boolean;
}

export function OverviewHeader({
  onCreateServer,
  onCheckUpdates,
  checkingUpdates = false,
}: Props): JSX.Element {
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
