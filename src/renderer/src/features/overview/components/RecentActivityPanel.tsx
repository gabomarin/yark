import type { ReactElement } from "react";
import { ArrowRight } from "@phosphor-icons/react";
import { Button, Group, Skeleton, Text, Timeline, Title, VisuallyHidden } from "@mantine/core";
import type { AppEvent } from "@shared/types";
import classes from "../OverviewPage.module.css";

interface Props {
  events: AppEvent[];
  loading: boolean;
  onViewAll: () => void;
}

function severityTimelineColor(severity: AppEvent["severity"]): string {
  if (severity === "error") return "red";
  if (severity === "warning") return "yellow";
  return "blue";
}

export function RecentActivityPanel({ events, loading, onViewAll }: Props): ReactElement {
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
            Recent activity
          </Title>
          <Text c="dimmed" size="sm">
            Relevant manager changes and operations.
          </Text>
        </div>
        <Button
          variant="subtle"
          size="compact-sm"
          rightSection={<ArrowRight size={14} />}
          onClick={onViewAll}
        >
          View logs
        </Button>
      </Group>

      {loading ? (
        <div role="status" aria-live="polite">
          <VisuallyHidden>Loading recent activity</VisuallyHidden>
          <Timeline
            active={-1}
            bulletSize={8}
            lineWidth={2}
            className={classes.recentTimeline}
          >
            {[0, 1, 2].map((item) => (
              <Timeline.Item
                key={item}
                aria-hidden="true"
                bullet={<Skeleton circle width={8} height={8} />}
                title={<Skeleton width={44} height={9} radius="xl" />}
              >
                <Skeleton width={`${72 - item * 8}%`} height={10} radius="xl" mt={4} />
              </Timeline.Item>
            ))}
          </Timeline>
        </div>
      ) : relevantEvents.length === 0 ? (
        <Text c="dimmed" size="sm" className={classes.recentEmpty}>
          No relevant operational activity yet.
        </Text>
      ) : (
        <Timeline
          active={relevantEvents.length}
          bulletSize={8}
          lineWidth={2}
          className={classes.recentTimeline}
        >
          {relevantEvents.map((event) => (
            <Timeline.Item
              key={event.id}
              color={severityTimelineColor(event.severity)}
              title={
                <Text c="dimmed" size="xs" className={classes.eventTime}>
                  {new Date(event.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>
              }
            >
              <Text
                size="sm"
                lineClamp={1}
                title={event.message}
                className={classes[`event-${event.severity}`]}
              >
                {event.message}
              </Text>
            </Timeline.Item>
          ))}
        </Timeline>
      )}
    </section>
  );
}
