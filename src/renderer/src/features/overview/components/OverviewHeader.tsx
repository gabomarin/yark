import type { ReactElement } from "react";
import { Button, Group, VisuallyHidden } from "@mantine/core";
import { AddServerSplitButton } from "@features/servers/components/AddServerSplitButton/AddServerSplitButton";
import classes from "../OverviewPage.module.css";

interface Props {
  onCreateServer: () => void;
  onImportServer: () => void;
  onCheckUpdates: () => void;
  onCheckInstalls: () => void;
  checkingUpdates?: boolean;
  checkingInstalls?: boolean;
}

export function OverviewHeader({
  onCreateServer,
  onImportServer,
  onCheckUpdates,
  onCheckInstalls,
  checkingUpdates = false,
  checkingInstalls = false,
}: Props): ReactElement {
  return (
    <header className={classes.header}>
      <h1 className={classes.title}>Servers</h1>
      <Group gap="sm" wrap="wrap" justify="flex-end" className={classes.headerActions}>
        <Button
          variant="subtle"
          color="gray"
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
          variant="subtle"
          color="gray"
          onClick={onCheckUpdates}
          loading={checkingUpdates}
        >
          Check for updates
        </Button>
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
