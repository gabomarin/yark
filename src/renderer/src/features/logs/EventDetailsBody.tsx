import { Badge, Text } from "@mantine/core";
import type { AppEvent } from "@shared/types";
import { resolveEventDetails } from "@shared/event-details";
import classes from "./LogsPage.module.css";

interface Props {
  event: AppEvent;
  expanded: boolean;
}

export function EventDetailsBody({ event, expanded }: Props): JSX.Element | null {
  if (!expanded) return null;
  const details = resolveEventDetails(event);
  return (
    <div className={classes.eventDetails}>
      <DetailLine label="What" value={details.what} />
      {details.cause !== null && <DetailLine label="Cause" value={details.cause} />}
      {details.location !== null && (
        <DetailLine label="Where" value={details.location} />
      )}
      {details.suggestion !== null && (
        <DetailLine label="Try next" value={details.suggestion} />
      )}
      {details.context.length > 0 && (
        <div className={classes.eventContext}>
          {details.context.map((item) => (
            <Badge key={item.label} variant="light" size="sm" radius="sm">
              {item.label}: {item.value}
            </Badge>
          ))}
        </div>
      )}
      <Text size="xs" c="dimmed">
        Type: {event.type} · Severity: {event.severity}
      </Text>
    </div>
  );
}

function DetailLine(props: { label: string; value: string }): JSX.Element {
  return (
    <div className={classes.eventDetailLine}>
      <Text size="xs" c="dimmed" className={classes.eventDetailLabel}>
        {props.label}
      </Text>
      <Text size="sm">{props.value}</Text>
    </div>
  );
}
