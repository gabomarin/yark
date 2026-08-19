import type { ReactElement } from "react";
import { Button, Group, VisuallyHidden } from "@mantine/core";
import { AddServerSplitButton } from "@features/servers/components/AddServerSplitButton/AddServerSplitButton";
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
}: Props): ReactElement {
  return (
    <header className={classes.header}>
      <h1 className={classes.title}>Servers</h1>
      <Group gap="md" wrap="wrap" justify="flex-end" className={classes.headerActions}>
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
            disabled={!canUpdateAllOutdated}
            loading={openingUpdateAllOutdated}
          >
            Update all outdated
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
