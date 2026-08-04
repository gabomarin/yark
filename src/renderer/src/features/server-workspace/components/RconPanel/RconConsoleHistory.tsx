import { ActionIcon, Badge, Button, Group, Stack, Text, Tooltip } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { ArrowClockwise, Copy, Trash } from "@phosphor-icons/react";
import type { ReactElement } from "react";
import type { RconHistoryEntry } from "../../serverWorkspaceTypes";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";
import classes from "./RconPanel.module.css";

const NO_CONTENT_RESPONSE = "Server received, But no response!!";

function hasDisplayableResponse(entry: RconHistoryEntry): boolean {
  if (entry.status !== "success") return true;
  const response = entry.response?.trim() ?? "";
  return response.length > 0 && response !== NO_CONTENT_RESPONSE;
}

function formatRconTime(date: string): string {
  return new Date(date).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function copyText(label: string, value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    notifications.show({
      color: "teal",
      message: `${label} copied`,
      autoClose: 1500,
    });
  } catch {
    notifications.show({
      color: "red",
      message: `Could not copy ${label.toLowerCase()}`,
    });
  }
}

interface Props {
  history: RconHistoryEntry[];
  serverRunning: boolean;
  submitPending: boolean;
  onRerun: (command: string) => void;
  onClear: () => void;
}

export function RconConsoleHistory(props: Props): ReactElement {
  const entries = props.history.filter(hasDisplayableResponse);

  return (
    <AppSurfaceCard tone="flat" padding="sm" radius="md" className={classes.responsesPanel}>
      <Stack gap={4}>
        <div className={classes.header}>
          <Text className={classes.title}>Console history</Text>
          <Tooltip label="Clear history">
            <ActionIcon
              size="sm"
              variant="default"
              aria-label="Clear RCON history"
              disabled={props.history.length === 0}
              onClick={props.onClear}
            >
              <Trash size={14} />
            </ActionIcon>
          </Tooltip>
        </div>

        {entries.length > 0 ? (
          <div className={classes.responseList}>
            {entries.map((entry) => {
              const statusLabel =
                entry.status === "pending"
                  ? "sending"
                  : entry.status === "error"
                    ? "failed"
                    : "ok";
              const statusColor =
                entry.status === "pending"
                  ? "gray"
                  : entry.status === "error"
                    ? "red"
                    : "teal";
              const body =
                entry.status === "pending"
                  ? "Sending…"
                  : (entry.error ?? entry.response ?? "No response");
              const responseText =
                entry.status === "pending"
                  ? null
                  : (entry.error ?? entry.response ?? "No response");
              return (
                <div key={entry.id} className={classes.responseItem}>
                  <div className={classes.responseHeader}>
                    <div style={{ minWidth: 0 }}>
                      <Text size="sm" className={classes.historyCommand}>
                        {entry.command}
                      </Text>
                      <Text className={classes.historyMeta}>
                        {formatRconTime(entry.createdAt)}
                      </Text>
                    </div>
                    <Badge size="sm" variant="light" color={statusColor}>
                      {statusLabel}
                    </Badge>
                  </div>
                  <Text size="sm" className={classes.responseBody}>
                    {body}
                  </Text>
                  <Group gap={4} wrap="wrap">
                    <Button
                      size="compact-xs"
                      variant="subtle"
                      leftSection={<Copy size={12} />}
                      onClick={() => void copyText("Command", entry.command)}
                    >
                      Copy command
                    </Button>
                    <Button
                      size="compact-xs"
                      variant="subtle"
                      leftSection={<Copy size={12} />}
                      disabled={responseText === null}
                      onClick={() => {
                        if (responseText !== null) {
                          void copyText("Response", responseText);
                        }
                      }}
                    >
                      Copy response
                    </Button>
                    <Button
                      size="compact-xs"
                      variant="subtle"
                      leftSection={<ArrowClockwise size={12} />}
                      disabled={!props.serverRunning || props.submitPending}
                      onClick={() => props.onRerun(entry.command)}
                    >
                      Re-run
                    </Button>
                  </Group>
                </div>
              );
            })}
          </div>
        ) : (
          <Text size="sm" c="dimmed">
            RCON responses will appear here.
          </Text>
        )}
      </Stack>
    </AppSurfaceCard>
  );
}
