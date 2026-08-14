import type { ReactElement } from "react";
import { Badge, Code, Text } from "@mantine/core";
import type { AppEvent } from "@shared/types";
import { resolveEventDetails } from "@shared/event-details";
import classes from "./LogsPage.module.css";

interface Props {
  event: AppEvent;
}

/** Detail body for an expanded log event (Accordion.Panel content). */
export function EventDetailsBody({ event }: Props): ReactElement {
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
      {details.excerpt !== null && details.excerpt.length > 0 && (
        <div className={classes.eventDetailLine}>
          <Text size="xs" c="dimmed" className={classes.eventDetailLabel}>
            Log excerpt
          </Text>
          <Code block>{details.excerpt}</Code>
        </div>
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

function DetailLine(props: { label: string; value: string }): ReactElement {
  return (
    <div className={classes.eventDetailLine}>
      <Text size="xs" c="dimmed" className={classes.eventDetailLabel}>
        {props.label}
      </Text>
      <Text size="sm">{props.value}</Text>
    </div>
  );
}
