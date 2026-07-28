import { Badge, Text, Title } from "@mantine/core";
import classes from "./ServerModsPanel.module.css";

interface Props {
  activeCount: number;
}

export function ServerModsHeader(props: Props): JSX.Element {
  return (
    <header className={classes.header}>
      <div>
        <Title order={3}>Mods</Title>
        <Text size="sm" c="dimmed">
          Configure which Project IDs load with this server or discover CurseForge mods.
        </Text>
      </div>
      <Badge color="teal" variant="light">{props.activeCount} active</Badge>
    </header>
  );
}
