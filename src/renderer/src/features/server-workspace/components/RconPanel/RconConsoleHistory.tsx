import { ActionIcon, Button, Group, Stack, Text, Tooltip } from "@mantine/core";
import { ArrowClockwise, Copy, Trash } from "@phosphor-icons/react";
import type { ReactElement } from "react";
import type { RconHistoryEntry } from "../../serverWorkspaceTypes";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";
import { StatusWord } from "@ui/StatusWord/StatusWord";
import { showOperatorError, showOperatorToast } from "@ui/operatorToast";
import classes from "./RconPanel.module.css";

const NO_CONTENT_RESPONSE = "Server received, But no response!!";

function formatResponseBody(entry: RconHistoryEntry): string {
  if (entry.status === "pending") return "Sending…";
  if (entry.status === "error") return entry.error ?? "Unknown error";
  const response = entry.response?.trim() ?? "";
  if (response.length === 0 || response === NO_CONTENT_RESPONSE) {
    return "No response";
  }
  return entry.response ?? "No response";
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
    showOperatorToast({
      title: "Copied",
      message: `${label} copied`,
      autoClose: 1500,
    });
  } catch {
    showOperatorError(`Could not copy ${label.toLowerCase()}`, "Copy failed");
  }
}

interface Props {
  history: RconHistoryEntry[];
  serverRunning: boolean;
  onRerun: (command: string) => void;
  onClear: () => void;
}

export function RconConsoleHistory(props: Props): ReactElement {
  const hasClearable = props.history.some(
    (entry) => entry.status !== "pending",
  );

  return (
    <AppSurfaceCard tone="flat" padding="sm" radius={0} className={classes.responsesPanel}>
      <Stack gap={4}>
        <div className={classes.header}>
          <Text className={classes.title}>Console history</Text>
          <Tooltip label="Clear history (keeps in-flight commands)">
            <ActionIcon
              size="sm"
              variant="default"
              aria-label="Clear RCON history"
              disabled={!hasClearable}
              onClick={props.onClear}
            >
              <Trash size={14} />
            </ActionIcon>
          </Tooltip>
        </div>

        {props.history.length > 0 ? (
          <div className={classes.responseList}>
            {props.history.map((entry) => {
              const statusLabel =
                entry.status === "pending"
                  ? "Sending"
                  : entry.status === "error"
                    ? "Failed"
                    : "Sent";
              const statusTone =
                entry.status === "pending"
                  ? "neutral"
                  : entry.status === "error"
                    ? "danger"
                    : "ok";
              const body = formatResponseBody(entry);
              const responseText =
                entry.status === "pending" ? null : body;
              const rerunBlocked =
                !props.serverRunning ||
                props.history.some(
                  (candidate) =>
                    candidate.status === "pending" &&
                    candidate.command === entry.command,
                );
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
                    <StatusWord tone={statusTone}>{statusLabel}</StatusWord>
                  </div>
                  <Text size="sm" className={classes.responseBody}>
                    {body}
                  </Text>
                  <Group gap={4} wrap="wrap">
                    <Button
                      variant="subtle"
                      leftSection={<Copy size={12} />}
                      onClick={() => void copyText("Command", entry.command)}
                    >
                      Copy command
                    </Button>
                    <Button
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
                      variant="subtle"
                      leftSection={<ArrowClockwise size={12} />}
                      disabled={rerunBlocked}
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
