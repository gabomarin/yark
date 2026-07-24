import { ArrowRight } from "@phosphor-icons/react";
import { Button, Group, Skeleton, Text, Title, VisuallyHidden } from "@mantine/core";
import type { AppEvent } from "@shared/types";
import classes from "../OverviewPage.module.css";

interface Props {
  events: AppEvent[];
  loading: boolean;
  onViewAll: () => void;
}

export function RecentActivityPanel({ events, loading, onViewAll }: Props): JSX.Element {
  const relevantEvents = events
    .filter((event) => event.type !== "rcon_command")
    .slice(0, 5);

  return (
    <section
      className={classes.recentSection}
      aria-labelledby="recent-activity-title"
      data-recent-activity
    >
      <Group justify="space-between" align="center" gap="sm">
        <div>
          <Title order={3} id="recent-activity-title" className={classes.recentTitle}>
            Actividad reciente
          </Title>
          <Text c="dimmed" size="sm">
            Cambios y operaciones relevantes del administrador.
          </Text>
        </div>
        <Button
          variant="subtle"
          size="compact-sm"
          rightSection={<ArrowRight size={14} />}
          onClick={onViewAll}
        >
          Ver registros
        </Button>
      </Group>

      {loading ? (
        <div className={classes.recentList} role="status" aria-live="polite">
          <VisuallyHidden>Cargando actividad reciente</VisuallyHidden>
          {[0, 1, 2].map((item) => (
            <div className={classes.recentRow} key={item} aria-hidden="true">
              <Skeleton circle width={6} height={6} />
              <Skeleton width={44} height={9} radius="xl" />
              <Skeleton width={`${72 - item * 8}%`} height={10} radius="xl" />
            </div>
          ))}
        </div>
      ) : relevantEvents.length === 0 ? (
        <Text c="dimmed" size="sm" className={classes.recentEmpty}>
          Todavía no hay actividad operativa relevante.
        </Text>
      ) : (
        <div className={classes.recentList}>
          {relevantEvents.map((event) => (
            <div key={event.id} className={classes.recentRow}>
              <span
                className={classes.eventIndicator}
                data-severity={event.severity}
                aria-hidden="true"
              />
              <Text c="dimmed" size="xs" className={classes.eventTime}>
                {new Date(event.createdAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Text>
              <Text
                size="sm"
                lineClamp={1}
                title={event.message}
                className={classes[`event-${event.severity}`]}
              >
                {event.message}
              </Text>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
