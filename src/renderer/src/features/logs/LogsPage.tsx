import { ClockCounterClockwise } from "@phosphor-icons/react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Select,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { PageScaffold } from "@layout/PageScaffold/PageScaffold";
import type { AppEvent, ServerProfile } from "@shared/types";
import { formatLogDateTime } from "@shared/format-log-datetime";
import { useEffect, useMemo, useState } from "react";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";
import { EmptyState } from "@ui/EmptyState/EmptyState";
import { SearchField } from "@ui/SearchField/SearchField";
import { EventDetailsBody } from "./EventDetailsBody";
import type { ServerLogsFocus } from "./ServerLogsPanel";
import classes from "./LogsPage.module.css";

type SeverityFilter = "problems" | "all" | "error" | "warning" | "info";
type TimeFilter = "24h" | "7d" | "all";

interface Props {
  servers: ServerProfile[];
  onOpenServerLogs: (serverId: string, focus?: ServerLogsFocus) => void;
}

function severityColor(severity: AppEvent["severity"]): string {
  if (severity === "error") return "red";
  if (severity === "warning") return "yellow";
  return "gray";
}

function focusForEvent(event: AppEvent): ServerLogsFocus {
  return {
    section: "events",
    eventId: event.id,
  };
}

export function LogsPage(props: Props): JSX.Element {
  const [fleetEvents, setFleetEvents] = useState<AppEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("problems");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("24h");
  const [search, setSearch] = useState("");
  const [expandedEventId, setExpandedEventId] = useState<number | null>(null);

  const serverNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const server of props.servers) {
      map.set(server.id, server.name);
    }
    return map;
  }, [props.servers]);

  const loadFleet = async () => {
    setLoading(true);
    setError(null);
    const result = await window.api.recentEvents(300);
    setLoading(false);
    if (!result.ok) {
      setFleetEvents([]);
      setError(result.error ?? "Could not load events across servers");
      return;
    }
    setFleetEvents(result.data);
  };

  useEffect(() => {
    void loadFleet();
  }, [props.servers]);

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
          event.serverId !== null ? (serverNameById.get(event.serverId) ?? "") : "";
        const haystack = `${serverName} ${event.type} ${event.message}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [fleetEvents, timeFilter, severityFilter, search, serverNameById]);

  return (
    <PageScaffold
      title="Logs"
      subtitle="Recent problems and activity across servers. Expand a row for details, or open it in the server Logs tab."
      fillViewport
      actions={
        <Button
          variant="default"
          leftSection={<ClockCounterClockwise size={16} />}
          onClick={() => void loadFleet()}
          disabled={loading}
        >
          Reload
        </Button>
      }
    >
      <Stack gap="lg" className={classes.logsContent} data-logs-page>
        {error !== null && <Alert color="red">{error}</Alert>}

        <AppSurfaceCard fill className={classes.fillPanel}>
          <Stack gap="sm" className={classes.panelStack}>
            <Group justify="space-between" align="flex-end" wrap="wrap" gap="sm">
              <Title order={3}>Activity across servers</Title>
              <Group gap="sm" wrap="wrap">
                <Select
                  aria-label="Severity filter"
                  value={severityFilter}
                  onChange={(value) =>
                    setSeverityFilter((value as SeverityFilter) ?? "problems")
                  }
                  data={[
                    { value: "problems", label: "Problems" },
                    { value: "all", label: "All severity" },
                    { value: "error", label: "Errors" },
                    { value: "warning", label: "Warnings" },
                    { value: "info", label: "Info" },
                  ]}
                  w={150}
                />
                <Select
                  aria-label="Time filter"
                  value={timeFilter}
                  onChange={(value) => setTimeFilter((value as TimeFilter) ?? "24h")}
                  data={[
                    { value: "24h", label: "Last 24h" },
                    { value: "7d", label: "Last 7 days" },
                    { value: "all", label: "All time" },
                  ]}
                  w={140}
                />
                <SearchField
                  value={search}
                  onChange={setSearch}
                  label="Search events across servers"
                  placeholder="Search…"
                  size="sm"
                  className={classes.fleetSearch}
                />
              </Group>
            </Group>

            {props.servers.length === 0 ? (
              <Text c="dimmed">No servers configured yet.</Text>
            ) : loading ? (
              <Text c="dimmed">Loading events…</Text>
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
                {filteredFleetEvents.map((event) => {
                  const serverName =
                    event.serverId !== null
                      ? (serverNameById.get(event.serverId) ?? "Unknown server")
                      : "System";
                  const expanded = expandedEventId === event.id;
                  return (
                    <div
                      key={event.id}
                      className={[
                        classes.fleetCard,
                        expanded ? classes.eventRowExpanded : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <button
                        type="button"
                        className={`${classes.fleetRow} ${classes.fleetRowClickable}`}
                        aria-expanded={expanded}
                        onClick={() =>
                          setExpandedEventId((current) =>
                            current === event.id ? null : event.id,
                          )
                        }
                      >
                        <Text size="sm" c="dimmed" className={classes.fleetWhen}>
                          {formatLogDateTime(event.createdAt)}
                        </Text>
                        <Badge color={severityColor(event.severity)} variant="light">
                          {event.severity}
                        </Badge>
                        <Text size="sm" fw={600} className={classes.fleetServer}>
                          {serverName}
                        </Text>
                        <Text size="sm" className={classes.fleetMessage}>
                          {event.message}
                        </Text>
                      </button>
                      <EventDetailsBody event={event} expanded={expanded} />
                      {expanded && event.serverId !== null && (
                        <Group justify="flex-end" px="sm" pb="sm">
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
                    </div>
                  );
                })}
              </div>
            )}
          </Stack>
        </AppSurfaceCard>
      </Stack>
    </PageScaffold>
  );
}
