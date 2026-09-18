import { ClockCounterClockwise } from "@phosphor-icons/react";
import { Accordion, Group, Stack, Text, Tooltip } from "@mantine/core";
import type { ServerOperationalLogs } from "@shared/types";
import { formatWhenLabel } from "@shared/format-log-datetime";
import { collapseConsecutiveEvents, formatEventMessageForDisplay } from "@shared/event-details";
import type { ReactElement } from "react";
import { EventDetailsBody } from "../../EventDetailsBody";
import { LoadingState } from "@ui/LoadingState/LoadingState";
import { EventSeverityMark } from "../EventSeverityMark/EventSeverityMark";
import classes from "../../LogsPage.module.css";
import {
  LogsClearAction,
  LogsEmptyState,
  LogsTabIntro,
} from "../LogsPanelChrome/LogsPanelChrome";

export interface LogsEventsTabProps {
  embedded?: boolean;
  loading: boolean;
  busy: boolean;
  logs: ServerOperationalLogs | null;
  highlightedEventId: number | null;
  expandedEventId: number | null;
  onExpandedEventIdChange: (id: number | null) => void;
  onClearEvents: () => void;
}

export function LogsEventsTab(props: LogsEventsTabProps): ReactElement {
  const {
    embedded,
    loading,
    busy,
    logs,
    highlightedEventId,
    expandedEventId,
    onExpandedEventIdChange,
    onClearEvents,
  } = props;

  return (
    <div className={classes.fillPanel}>
      <Stack gap="sm" className={classes.panelStack}>
        <LogsTabIntro
          embedded={embedded}
          title="Events"
          purpose="Manager activity for this server: starts, stops, backups, updates, and errors."
          useWhen="You want a timeline of what the app did, or why an operation failed. Expand a row for cause and next steps."
          action={
            <LogsClearAction
              label="Clear all events for this server"
              onClick={onClearEvents}
              disabled={
                loading || busy || logs === null || logs.events.length === 0
              }
            />
          }
        />
        {loading ? (
          <LoadingState label="events" />
        ) : logs === null || logs.events.length === 0 ? (
          <LogsEmptyState
            icon={<ClockCounterClockwise size={24} />}
            title="No recent events"
            description="Starts, stops, backup/update results, and errors will appear here as you operate this server."
          />
        ) : (
          <div className={classes.eventList} data-logs-scroll-region="events">
            <Accordion
              variant="contained"
              radius={0}
              keepMounted={false}
              transitionDuration={0}
              value={expandedEventId !== null ? String(expandedEventId) : null}
              onChange={(value) => {
                if (value === null) {
                  onExpandedEventIdChange(null);
                  return;
                }
                const id = Number(value);
                onExpandedEventIdChange(Number.isFinite(id) ? id : null);
              }}
              classNames={{
                item: classes.eventAccordionItem,
                control: classes.eventAccordionControl,
                panel: classes.eventAccordionPanel,
              }}
            >
              {collapseConsecutiveEvents(logs.events).map(({ event, count }) => {
                const focused = highlightedEventId === event.id;
                const expanded = expandedEventId === event.id;
                return (
                  <Accordion.Item
                    key={event.id}
                    value={String(event.id)}
                    className={
                      focused || expanded ? classes.eventRowFocused : undefined
                    }
                  >
                    <Accordion.Control data-log-event-id={event.id}>
                      <Group
                        justify="space-between"
                        align="center"
                        gap="sm"
                        wrap="nowrap"
                      >
                        <div className={classes.eventRowMain}>
                          <Tooltip label={formatWhenLabel(event.createdAt).tooltip}>
                            <Text size="sm" c="dimmed">
                              {formatWhenLabel(event.createdAt).primary}
                            </Text>
                          </Tooltip>
                          <Text size="sm" fw={expanded ? 600 : 400} className={classes.eventMessage}>
                            {formatEventMessageForDisplay(event.message)}
                            {count > 1 ? ` · ×${count}` : ""}
                          </Text>
                        </div>
                        <EventSeverityMark severity={event.severity} />
                      </Group>
                    </Accordion.Control>
                    <Accordion.Panel>
                      <EventDetailsBody event={event} />
                    </Accordion.Panel>
                  </Accordion.Item>
                );
              })}
            </Accordion>
          </div>
        )}
      </Stack>
    </div>
  );
}
