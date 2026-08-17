import type { ReactElement } from "react";
import { Badge, Group, Text, Title } from "@mantine/core";
import classes from "./ServerModsPanel.module.css";

interface Props {
  activeCount: number;
  disabledCount: number;
}

export function ServerModsHeader(props: Props): ReactElement {
  return (
    <header className={classes.header}>
      <div>
        <Title order={3}>Mods</Title>
        <Text size="sm" c="dimmed">
          Configure which Project IDs load with this server or discover CurseForge mods.
        </Text>
      </div>
      <Group gap="xs" wrap="nowrap">
        <Badge color="teal" variant="light">{props.activeCount} active</Badge>
        {props.disabledCount > 0 && (
          <Badge color="yellow" variant="light">{props.disabledCount} disabled</Badge>
        )}
      </Group>
    </header>
  );
}
