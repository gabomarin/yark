import { Card, List, Stack, Text, Title } from "@mantine/core";
import type { AppEvent } from "@shared/types";
import classes from "../OverviewPage.module.css";

interface Props {
  events: AppEvent[];
}

export function RecentActivityPanel({ events }: Props): JSX.Element {
  return (
    <Card withBorder className={classes.recentPanel}>
      <Stack gap="sm">
        <Title order={3}>Actividad reciente</Title>
        {events.length === 0 ? (
          <Text c="dimmed">Sin eventos recientes.</Text>
        ) : (
          <List spacing="xs" className={classes.recentList}>
            {events.map((event) => (
              <List.Item key={event.id} className={classes[`event-${event.severity}`]}>
                <Text span c="dimmed">{new Date(event.createdAt).toLocaleTimeString()} </Text>
                <Text span>{event.message}</Text>
              </List.Item>
            ))}
          </List>
        )}
      </Stack>
    </Card>
  );
}