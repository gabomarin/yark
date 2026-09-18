import { runWithFinally } from "@renderer/shared/async/runWithFinally";
import type { ReactElement } from "react";
import { ClockCounterClockwise, HardDrives } from "@phosphor-icons/react";
import {
  Accordion,
  Alert,
  Badge,
  Button,
  Group,
  Select,
  Stack,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { PageScaffold } from "@layout/PageScaffold/PageScaffold";
import type { AppEvent, ServerProfile } from "@shared/types";
import { formatWhenLabel } from "@shared/format-log-datetime";
import { collapseConsecutiveEvents, formatEventMessageForDisplay } from "@shared/event-details";
import { useEffect, useMemo, useRef, useState } from "react";
import { EmptyState } from "@ui/EmptyState/EmptyState";
import { LoadingState } from "@ui/LoadingState/LoadingState";
import { AppPageHeader } from "@ui/AppPageHeader/AppPageHeader";
import { SearchField } from "@ui/SearchField/SearchField";
import { EventDetailsBody } from "./EventDetailsBody";
import { EventSeverityMark } from "./components/EventSeverityMark/EventSeverityMark";
import type { ServerLogsFocus } from "./ServerLogsPanel";
import classes from "./LogsPage.module.css";

type SeverityFilter = "problems" | "all" | "error" | "warning" | "info";
type TimeFilter = "24h" | "7d" | "all";

interface Props {
  servers: ServerProfile[];
  onOpenServerLogs: (serverId: string, focus?: ServerLogsFocus) => void;
}

function focusForEvent(event: AppEvent): ServerLogsFocus {
  return {
    section: "events",
    eventId: event.id,
  };
}

export function LogsPage(props: Props): ReactElement {
  const [fleetEvents, setFleetEvents] = useState<AppEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("24h");
  const [search, setSearch] = useState("");
  const [expandedEventId, setExpandedEventId] = useState<number | null>(null);

  const serverById = useMemo(() => {
    const map = new Map<string, ServerProfile>();
    for (const server of props.servers) {
      map.set(server.id, server);
    }
    return map;
  }, [props.servers]);

  const loadGenerationRef = useRef(0);
  const loadFleet = async (opts?: { cancelled?: () => boolean }) => {
    const generation = ++loadGenerationRef.current;
    setLoading(true);
    setError(null);
    await runWithFinally(
      async () => {
        const result = await window.api.recentEvents(300);
        if (opts?.cancelled?.() || generation !== loadGenerationRef.current) return;
        if (!result.ok) {
          setFleetEvents([]);
          setError(result.error ?? "Could not load events across servers");
          return;
        }
        setFleetEvents(result.data);
      },
      () => {
        if (generation === loadGenerationRef.current) {
          setLoading(false);
        }
      },
    );
  };

  // Mount / explicit Reload only — do not key on props.servers (#163).
  // App may refresh the profile list while this page is open; servers is a
  // name lookup for the fleet table, not a signal to re-fetch recentEvents.
  useEffect(() => {
    let cancelled = false;
    void loadFleet({ cancelled: () => cancelled });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredFleetEvents = useMemo(() => {
    const now = Date.now();
    const cutoffMs =
      timeFilter === "24h"
        ? now - 24 * 60 * 60 * 1000
        : timeFilter === "7d"
          ? now - 7 * 24 * 60 * 60 * 1000
          : null;
    const query = search.trim().toLowerCase();

    return fleetEvents.filter((event) => {
      if (cutoffMs !== null) {
        const ts = new Date(event.createdAt).getTime();
        if (!Number.isFinite(ts) || ts < cutoffMs) return false;
      }
      if (severityFilter === "problems") {
        if (event.severity !== "error" && event.severity !== "warning") return false;
      } else if (severityFilter !== "all" && event.severity !== severityFilter) {
        return false;
      }
      if (query.length > 0) {
        const serverName =
          event.serverId !== null ? (serverById.get(event.serverId)?.name ?? "") : "";
        const haystack = `${serverName} ${event.type} ${event.message}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [fleetEvents, timeFilter, severityFilter, search, serverById]);

  const collapsedFleetEvents = useMemo(
    () => collapseConsecutiveEvents(filteredFleetEvents),
    [filteredFleetEvents],
  );

  return (
    <PageScaffold
      title="Logs"
      fillViewport
      edgeToEdge
      showHeader={false}
    >
      <div className={classes.pageShell} data-logs-page>
        <AppPageHeader
          title="Logs"
          actions={
            <Button
              variant="default"
              onClick={() => void loadFleet()}
              disabled={loading}
            >
              Reload
            </Button>
          }
        />

        <Stack gap="sm" className={classes.logsContent}>
          {error !== null && <Alert color="red">{error}</Alert>}

          <div className={classes.fillPanel}>
            <Stack gap="sm" className={classes.panelStack}>
            <Group justify="space-between" align="flex-end" wrap="wrap" gap="sm">
              <Title order={3}>Activity across servers</Title>
              <Group gap="sm" wrap="wrap">
                <Select
                  aria-label="Severity filter"
                  value={severityFilter}
                  allowDeselect={false}
                  onChange={(value) =>
                    setSeverityFilter((value as SeverityFilter) ?? "all")
                  }
                  data={[
                    { value: "all", label: "All severity" },
                    { value: "problems", label: "Problems" },
                    { value: "error", label: "Errors" },
                    { value: "warning", label: "Warnings" },
                    { value: "info", label: "Info" },
                  ]}
                  w={160}
                />
                <Select
                  aria-label="Time filter"
                  value={timeFilter}
                  allowDeselect={false}
                  onChange={(value) => setTimeFilter((value as TimeFilter) ?? "24h")}
                  data={[
                    { value: "24h", label: "Last 24h" },
                    { value: "7d", label: "Last 7 days" },
                    { value: "all", label: "All time" },
                  ]}
                  w={150}
                />
                <SearchField
                  value={search}
                  onChange={setSearch}
                  label="Search events across servers"
                  placeholder="Search messages…"
                  className={classes.fleetSearch}
                />
              </Group>
            </Group>

            {props.servers.length === 0 ? (
              <EmptyState
                layout="stacked"
                icon={<HardDrives size={24} />}
                title="No servers configured yet"
                description="Create a server first to see fleet activity here."
              />
            ) : loading ? (
              <LoadingState label="events" />
            ) : filteredFleetEvents.length === 0 ? (
              <EmptyState
                layout="stacked"
                icon={<ClockCounterClockwise size={24} />}
                title={
                  severityFilter === "problems"
                    ? "No problems in this window"
                    : "No matching activity"
                }
                description={
                  severityFilter === "problems"
                    ? "No errors or warnings matched the current filters. Switch to “All severity” to see routine activity."
                    : "Try widening the time range or clearing the search."
                }
              />
            ) : (
              <div className={classes.eventList} data-logs-scroll-region="fleet">
                <Accordion
                  variant="contained"
                  radius={0}
                  keepMounted={false}
                  transitionDuration={0}
                  value={
                    expandedEventId !== null ? String(expandedEventId) : null
                  }
                  onChange={(value) => {
                    if (value === null) {
                      setExpandedEventId(null);
                      return;
                    }
                    const id = Number(value);
                    setExpandedEventId(Number.isFinite(id) ? id : null);
                  }}
                  classNames={{
                    item: classes.fleetAccordionItem,
                    control: classes.fleetAccordionControl,
                    panel: classes.eventAccordionPanel,
                  }}
                >
                  {collapsedFleetEvents.map(({ event, count }) => {
                    const server =
                      event.serverId !== null
                        ? serverById.get(event.serverId)
                        : undefined;
                    const serverName =
                      event.serverId !== null
                        ? (server?.name ?? "Unknown server")
                        : "System";
                    const when = formatWhenLabel(event.createdAt);
                    return (
                      <Accordion.Item
                        key={event.id}
                        value={String(event.id)}
                        className={
                          expandedEventId === event.id
                            ? classes.eventRowFocused
                            : undefined
                        }
                      >
                        <Accordion.Control>
                          <div className={classes.fleetRow} data-fleet-row>
                            <Tooltip label={when.tooltip}>
                              <Text size="sm" c="dimmed" className={classes.fleetWhen}>
                                {when.primary}
                              </Text>
                            </Tooltip>
                            <span className={classes.fleetSeverity} data-fleet-severity>
                              <EventSeverityMark severity={event.severity} />
                            </span>
                            <Group gap="xs" wrap="nowrap" className={classes.fleetServer}>
                              <Text size="sm" fw={600} span>
                                {serverName}
                              </Text>
                              {server?.enabled === false && (
                                <Badge size="xs" color="gray" variant="light">
                                  Inactive
                                </Badge>
                              )}
                            </Group>
                            <Text size="sm" className={classes.fleetMessage}>
                              {formatEventMessageForDisplay(event.message)}
                              {count > 1 ? ` · ×${count}` : ""}
                            </Text>
                          </div>
                        </Accordion.Control>
                        <Accordion.Panel>
                          <EventDetailsBody event={event} />
                          {event.serverId !== null && (
                            <Group justify="flex-end" mt="sm">
                              <Button
                                size="compact-sm"
                                variant="light"
                                onClick={() =>
                                  props.onOpenServerLogs(
                                    event.serverId!,
                                    focusForEvent(event),
                                  )
                                }
                              >
                                Open in server
                              </Button>
                            </Group>
                          )}
                        </Accordion.Panel>
                      </Accordion.Item>
                    );
                  })}
                </Accordion>
              </div>
            )}
          </Stack>
        </div>
      </Stack>
      </div>
    </PageScaffold>
  );
}
