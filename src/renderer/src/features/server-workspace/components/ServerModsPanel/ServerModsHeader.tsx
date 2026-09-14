import type { ReactElement } from "react";
import { Button, Group, Text, Title } from "@mantine/core";
import { DismissibleHint } from "@ui/DismissibleHint/DismissibleHint";
import classes from "./ServerModsPanel.module.css";

interface Props {
  activeCount: number;
  disabledCount: number;
  discovering: boolean;
  onDiscover: () => void;
  onBack: () => void;
}

const MODS_HINT_KEY = "yark.mods.projectIdHint.dismissed.v1";

export function ServerModsHeader(props: Props): ReactElement {
  return (
    <header className={classes.header}>
      <div>
        <Title order={3}>Mods</Title>
        <DismissibleHint storageKey={MODS_HINT_KEY} title="Project ID vs Discover">
          Add a known CurseForge Project ID or mod URL on this tab. Discover
          searches the ASA catalog — it is not the same as pasting an ID.
        </DismissibleHint>
      </div>
      <Group gap="xs" wrap="nowrap">
        <Text size="sm" c="dimmed">
          {props.activeCount} active
        </Text>
        {props.disabledCount > 0 && (
          <Text size="sm" c="dimmed">
            {props.disabledCount} disabled
          </Text>
        )}
        {props.discovering ? (
          <Button variant="subtle" onClick={props.onBack}>
            Back to server mods
          </Button>
        ) : (
          <Button variant="light" onClick={props.onDiscover}>
            Discover mods
          </Button>
        )}
      </Group>
    </header>
  );
}
