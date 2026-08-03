import { Badge, Button, Group, Stack, Text, TextInput } from "@mantine/core";
import type { AppEvent, ServerProfile, ServerRuntimeInfo } from "@shared/types";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";
import type { RconHistoryEntry } from "../../serverWorkspaceTypes";
import classes from "./RconPanel.module.css";

interface Props {
  server: ServerProfile;
  runtime: ServerRuntimeInfo | null;
  events: AppEvent[];
  rconHistory: RconHistoryEntry[];
  onSendRcon: (serverId: string, command: string) => Promise<boolean>;
}

type QuickCommand = {
  label: string;
  command: string;
  danger?: boolean;
};

type MockPlayer = {
  name: string;
  steamId: string;
  onlineFor: string;
};

const QUICK_COMMANDS: QuickCommand[] = [
  { label: "SaveWorld", command: "SaveWorld" },
  { label: "ListPlayers", command: "ListPlayers" },
  { label: "DestroyWildDinos", command: "DestroyWildDinos", danger: true },
  { label: "GetChat", command: "GetChat" },
  { label: "DoExit", command: "DoExit", danger: true },
] as const;

const MOCK_PLAYERS: MockPlayer[] = [
  { name: "SurvivorOne", steamId: "7656119...", onlineFor: "21m" },
  { name: "RexHunter", steamId: "7656119...", onlineFor: "7m" },
  { name: "Maya", steamId: "7656119...", onlineFor: "4m" },
];

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

function extractCommand(message: string): string {
  const prefix = 'RCON on "';
  if (!message.startsWith(prefix)) return message;
  const marker = '": ';
  const index = message.indexOf(marker);
  if (index < 0) return message;
  return message.slice(index + marker.length);
}

export function RconPanel(props: Props): ReactElement {
  const [command, setCommand] = useState("");
  const [sending, setSending] = useState(false);
  const isRunning = props.runtime?.status === "running";

  const history = useMemo(
    () =>
      props.events
        .filter((event) => event.serverId === props.server.id && event.type === "rcon_command")
        .slice(0, 5),
    [props.events, props.server.id],
  );

  const responses = useMemo(
    () => props.rconHistory.filter(hasDisplayableResponse).slice(0, 5),
    [props.rconHistory],
  );

  const sendCommand = async (nextCommand: string): Promise<void> => {
    const trimmed = nextCommand.trim();
    if (trimmed.length === 0 || !isRunning || sending) {
      return;
    }
    setSending(true);
    try {
      const ok = await props.onSendRcon(props.server.id, trimmed);
      if (ok) {
        setCommand("");
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={classes.root}>
      <div className={classes.mainColumn}>
        <AppSurfaceCard tone="flat" fill padding="sm" radius="md" className={classes.mainPanel}>
          <Stack gap="sm">
            <div className={classes.header}>
              <div>
                <Text className={classes.title}>RCON</Text>
                <Text size="sm" className={classes.helper}>
                  Admin commands for the active server. Commands work best without the 'cheat' prefix (e.g., SaveWorld, ListPlayers, DestroyWildDinos).
                </Text>
              </div>
              <Badge size="sm" variant="light" color={isRunning ? "teal" : "gray"}>
                {isRunning ? "running" : "stopped"}
              </Badge>
            </div>

            <div className={classes.chips}>
              {QUICK_COMMANDS.map((item) => (
                <Button
                  key={item.label}
                  size="xs"
                  radius="xl"
                  variant={item.danger ? "light" : "default"}
                  color={item.danger ? "red" : "gray"}
                  disabled={!isRunning || sending}
                  onClick={() => setCommand(item.command)}
                >
                  {item.label}
                </Button>
              ))}
            </div>

            <div className={classes.commandBlock}>
              <TextInput
                label="RCON command"
                placeholder="e.g., ListPlayers, SaveWorld, or DoExit"
                size="xs"
                value={command}
                onChange={(event) => setCommand(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendCommand(command);
                  }
                }}
              />
              <Group justify="space-between" align="flex-end" gap="xs">
                <Text size="xs" c="dimmed">
                  Press Enter to send. Commands are recorded in history below.
                </Text>
                <Button
                  size="xs"
                  onClick={() => void sendCommand(command)}
                  disabled={!isRunning || sending || command.trim().length === 0}
                >
                  Send
                </Button>
              </Group>
            </div>

            <Stack gap={4}>
              <Text className={classes.title}>Recent commands</Text>
              {history.length > 0 ? (
                <div className={classes.historyList}>
                  {history.map((event) => (
                    <div key={event.id} className={classes.historyItem}>
                      <div style={{ minWidth: 0 }}>
                        <Text size="sm" className={classes.historyCommand}>
                          {extractCommand(event.message)}
                        </Text>
                        <Text className={classes.historyMeta}>
                          {formatRconTime(event.createdAt)}
                        </Text>
                      </div>
                      <Badge
                        size="sm"
                        variant="light"
                        color={event.severity === "error" ? "red" : "blue"}
                      >
                        sent
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <Text size="sm" c="dimmed">
                  Sent RCON commands will appear here.
                </Text>
              )}
            </Stack>
          </Stack>
        </AppSurfaceCard>

        <AppSurfaceCard tone="flat" padding="sm" radius="md" className={classes.responsesPanel}>
          <Stack gap={4}>
            <Text className={classes.title}>Responses</Text>
            {responses.length > 0 ? (
              <div className={classes.responseList}>
                {responses.map((entry) => {
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
                      : entry.error ?? entry.response ?? "No response";
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
      </div>

      <AppSurfaceCard tone="flat" padding="sm" radius="md" className={classes.playersPanel}>
        <Stack gap="xs">
          <div className={classes.header}>
            <div>
              <Text className={classes.title}>Players</Text>
              <Text size="sm" className={classes.helper}>
                Mock layout for connected players and admin actions.
              </Text>
            </div>
          </div>

          <div className={classes.playerList}>
            {MOCK_PLAYERS.map((player) => (
              <div key={player.name} className={classes.playerItem}>
                <div className={classes.playerMeta}>
                  <Text size="sm" className={classes.playerName}>
                    {player.name}
                  </Text>
                  <Text className={classes.historyMeta}>
                    SteamID: {player.steamId} · Online {player.onlineFor}
                  </Text>
                </div>
                <div className={classes.playerActions}>
                  <Button size="xs" variant="default" disabled title="Mock only">
                    Check ID
                  </Button>
                  <Button size="xs" variant="light" color="red" disabled title="Mock only">
                    Kick
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Stack>
      </AppSurfaceCard>
    </div>
  );
}
