import { Badge, Button, Group, Stack, Text, TextInput } from "@mantine/core";
import type { AppEvent, ServerProfile, ServerRuntimeInfo } from "@shared/types";
import type { ReactElement } from "react";
import { useEffect, useMemo, useState } from "react";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";
import type { RconHistoryEntry } from "../../serverWorkspaceTypes";
import { RconConsoleHistory } from "./RconConsoleHistory";
import {
  PlayerListSection,
  type PlayerListState,
} from "./PlayerListSection";
import classes from "./RconPanel.module.css";

interface Props {
  server: ServerProfile;
  runtime: ServerRuntimeInfo | null;
  events: AppEvent[];
  rconHistory: RconHistoryEntry[];
  playerList: PlayerListState;
  onSendRcon: (serverId: string, command: string) => Promise<boolean>;
  onClearRconHistory: (serverId: string) => void;
  onRconTabFocusChanged: (serverId: string, isFocused: boolean) => Promise<void>;
  onRefreshPlayers: (serverId: string) => Promise<void>;
  onKickPlayer: (serverId: string, playerKey: string) => Promise<boolean>;
  onBanPlayer: (serverId: string, playerKey: string) => Promise<boolean>;
}

type QuickCommand = {
  label: string;
  command: string;
  danger?: boolean;
};

const QUICK_COMMANDS: QuickCommand[] = [
  { label: "SaveWorld", command: "SaveWorld" },
  { label: "Broadcast", command: "Broadcast " },
  { label: "ListPlayers", command: "ListPlayers" },
  { label: "DestroyWildDinos", command: "DestroyWildDinos", danger: true },
  { label: "GetChat", command: "GetChat" },
  { label: "DoExit", command: "DoExit", danger: true },
] as const;

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
  const { server, onRconTabFocusChanged } = props;
  const [command, setCommand] = useState("");
  const [rconConnected, setRconConnected] = useState(false);
  const isRunning = props.runtime?.status === "running";
  const isStarting = props.runtime?.status === "starting";
  const commandTrimmed = command.trim();
  // App-level history survives tab unmount; only block an identical pending command.
  const identicalPending = props.rconHistory.some(
    (entry) =>
      entry.status === "pending" && entry.command === commandTrimmed,
  );

  useEffect(() => {
    if (!isRunning) {
      return;
    }
    void onRconTabFocusChanged(server.id, true);
    return () => {
      void onRconTabFocusChanged(server.id, false);
    };
  }, [isRunning, server.id, onRconTabFocusChanged]);

  useEffect(() => {
    if (typeof window.api?.getRconStatus !== "function") return;
    let cancelled = false;
    const unsubscribe = window.api.onRconStatusChanged((payload) => {
      if (payload.serverId === props.server.id) {
        setRconConnected(payload.status === "connected");
      }
    });
    void window.api.getRconStatus(props.server.id).then((result) => {
      if (cancelled || !result.ok) return;
      setRconConnected(result.data.status === "connected");
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [props.server.id]);

  const auditHistory = useMemo(
    () =>
      props.events
        .filter(
          (event) =>
            event.serverId === props.server.id && event.type === "rcon_command",
        )
        .slice(0, 5),
    [props.events, props.server.id],
  );

  const sendCommand = async (nextCommand: string): Promise<void> => {
    const trimmed = nextCommand.trim();
    if (trimmed.length === 0 || !isRunning) {
      return;
    }
    const pendingSame = props.rconHistory.some(
      (entry) => entry.status === "pending" && entry.command === trimmed,
    );
    if (pendingSame) {
      return;
    }
    const ok = await props.onSendRcon(props.server.id, trimmed);
    if (ok) {
      setCommand("");
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
            </div>

            <div className={classes.chips}>
              {QUICK_COMMANDS.map((item) => (
                <Button
                  key={item.label}
                  size="xs"
                  radius="xl"
                  variant={item.danger ? "light" : "default"}
                  color={item.danger ? "red" : "gray"}
                  disabled={!isRunning}
                  onClick={() => {
                    // Broadcast needs a message — prefill the input for editing.
                    if (item.command.endsWith(" ")) {
                      setCommand(item.command);
                      return;
                    }
                    void sendCommand(item.command);
                  }}
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
                  disabled={
                    !isRunning ||
                    identicalPending ||
                    commandTrimmed.length === 0
                  }
                >
                  Send
                </Button>
              </Group>
            </div>

            <Stack gap={4}>
              <Text className={classes.title}>Recent commands</Text>
              {auditHistory.length > 0 ? (
                <div className={classes.historyList}>
                  {auditHistory.map((event) => (
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

        <RconConsoleHistory
          history={props.rconHistory}
          serverRunning={isRunning}
          onRerun={(next) => void sendCommand(next)}
          onClear={() => props.onClearRconHistory(props.server.id)}
        />
      </div>

      <PlayerListSection
        serverId={props.server.id}
        serverRunning={isRunning}
        serverStarting={isStarting}
        rconConnected={rconConnected}
        playerList={props.playerList}
        onRefreshPlayers={props.onRefreshPlayers}
        onKickPlayer={props.onKickPlayer}
        onBanPlayer={props.onBanPlayer}
      />
    </div>
  );
}
