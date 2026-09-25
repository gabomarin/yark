import type { ReactElement, ReactNode } from "react";
import { Group, Text, Title } from "@mantine/core";
import { DismissibleHint } from "@ui/DismissibleHint/DismissibleHint";
import { MODS_PROJECT_ID_HINT_STORAGE_KEY } from "./serverModsModel";
import classes from "./ServerModsPanel.module.css";

interface Props {
  activeCount: number;
  disabledCount: number;
  /** Server-view quick actions (#637); omitted on Discover. */
  actions?: ReactNode;
}

export function ServerModsHeader(props: Props): ReactElement {
  return (
    <header className={classes.header}>
      <div>
        <Title order={3}>Mods</Title>
        <DismissibleHint storageKey={MODS_PROJECT_ID_HINT_STORAGE_KEY} title="Project ID vs Discover">
          Add a known CurseForge Project ID or mod URL on this tab. Discover searches the ASA catalog — it is not the
          same as pasting an ID.
        </DismissibleHint>
      </div>
      <Group gap="xs" wrap="nowrap" align="center">
        <Text size="sm" c="dimmed">
          {props.activeCount} active
        </Text>
        {props.disabledCount > 0 && (
          <Text size="sm" c="dimmed">
            {props.disabledCount} disabled
          </Text>
        )}
        {props.actions}
      </Group>
    </header>
  );
}
