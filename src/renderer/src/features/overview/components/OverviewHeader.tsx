import type { ReactElement } from "react";
import { Button, Group, Text, VisuallyHidden } from "@mantine/core";
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
  /** Known online survivors across running servers; `null` until a real RCON sample exists. */
  survivorsOnlineTotal?: number | null;
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
}: Props): ReactElement {
  const survivorsLabel =
    survivorsOnlineTotal == null
      ? "Survivors –"
      : survivorsOnlineTotal === 1
        ? "1 survivor online"
        : `${survivorsOnlineTotal} survivors online`;

  return (
    <header className={classes.header}>
      <h1 className={classes.title}>Servers</h1>
      <Group gap="md" wrap="wrap" justify="flex-end" className={classes.headerActions}>
        <Text
          size="sm"
          c="dimmed"
          className={classes.survivorsSummary}
          data-survivors-online={
            survivorsOnlineTotal == null ? undefined : survivorsOnlineTotal
          }
        >
          {survivorsLabel}
        </Text>
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
