import { ActionIcon, Button, Group, Stack, Text, Loader, Tooltip } from "@mantine/core";
import { modals } from "@mantine/modals";
import { ArrowClockwise } from "@phosphor-icons/react";
import type { OnlinePlayerInfo } from "@shared/ipc";
import type { ReactElement } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";
import { BannedPlayersSection } from "./BannedPlayersSection";
import {
  PlayerIdentityRow,
  mergeNameHints,
  resolvePlayerDisplayName,
} from "./PlayerIdentityRow";
import classes from "./RconPanel.module.css";

export interface PlayerListState {
  players: OnlinePlayerInfo[];
  error: string | null;
  loading: boolean;
}

interface Props {
  serverId: string;
  serverRunning: boolean;
  serverStarting?: boolean;
  rconConnected: boolean;
  playerList: PlayerListState;
  onRefreshPlayers: (serverId: string) => Promise<void>;
  onKickPlayer: (serverId: string, playerKey: string) => Promise<boolean>;
  onBanPlayer: (serverId: string, playerKey: string) => Promise<boolean>;
}

export function PlayerListSection(props: Props): ReactElement {
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [panelRefreshing, setPanelRefreshing] = useState(false);
  const [nameById, setNameById] = useState(() => new Map<string, string>());
  const reloadBannedRef = useRef<(() => Promise<void>) | null>(null);
  const rconDisabled =
    !props.serverRunning || !props.rconConnected || props.playerList.loading;

  useEffect(() => {
    setNameById((previous) =>
      mergeNameHints(previous, props.playerList.players),
    );
  }, [props.playerList.players]);

  const onBannedEntriesLoaded = useCallback((entries: OnlinePlayerInfo[]) => {
    setNameById((previous) => mergeNameHints(previous, entries));
  }, []);

  const refreshAll = async (): Promise<void> => {
    setPanelRefreshing(true);
    try {
      await props.onRefreshPlayers(props.serverId);
      await (reloadBannedRef.current?.() ?? Promise.resolve());
    } finally {
      setPanelRefreshing(false);
    }
  };

  const runAction = async (
    playerKey: string,
    action: () => Promise<boolean>,
  ): Promise<void> => {
    setActionKey(playerKey);
    try {
      await action();
    } finally {
      setActionKey(null);
    }
  };

  const confirmBan = (player: OnlinePlayerInfo): void => {
    const label = resolvePlayerDisplayName(player.key, player.name, nameById);
    modals.openConfirmModal({
      title: "Ban player?",
      children: (
        <Text size="sm">
          Ban <strong>{label}</strong>?
        </Text>
      ),
      labels: { confirm: "Ban", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: () => {
        void runAction(player.key, async () => {
          const ok = await props.onBanPlayer(props.serverId, player.key);
          if (ok) {
            if (player.name) {
              setNameById((previous) =>
                mergeNameHints(previous, [player]),
              );
            }
            await reloadBannedRef.current?.();
          }
          return ok;
        });
      },
    });
  };

  const statusMessage = (() => {
    if (!props.serverRunning && props.serverStarting) {
      return "Server starting…";
    }
    if (!props.serverRunning) {
      return "Server stopped.";
    }
    if (!props.rconConnected) {
      return "Waiting for RCON…";
    }
    if (props.playerList.error !== null) {
      return null;
    }
    if (props.playerList.loading && props.playerList.players.length === 0) {
      return "Loading…";
    }
    if (props.playerList.players.length === 0) {
      return "No players online.";
    }
    return null;
  })();

  return (
    <AppSurfaceCard tone="flat" padding="sm" radius="md" className={classes.playersPanel}>
      <Stack gap="sm">
        <div className={classes.header}>
          <Text className={classes.title}>Players</Text>
          <Tooltip label="Refresh panel">
            <ActionIcon
              size="sm"
              variant="default"
              aria-label="Refresh players panel"
              loading={panelRefreshing || props.playerList.loading}
              onClick={() => void refreshAll()}
            >
              <ArrowClockwise size={14} />
            </ActionIcon>
          </Tooltip>
        </div>

        <Text className={classes.sectionTitle}>Online</Text>

        {props.playerList.error !== null ? (
          <Text size="sm" c="red">
            {props.playerList.error}
          </Text>
        ) : statusMessage !== null ? (
          <Group gap="xs">
            {statusMessage === "Loading…" ? <Loader size="xs" /> : null}
            <Text size="sm" c="dimmed">
              {statusMessage}
            </Text>
          </Group>
        ) : (
          <div className={classes.playerList}>
            {props.playerList.players.map((player) => {
              const busy = actionKey === player.key;
              const name = resolvePlayerDisplayName(
                player.key,
                player.name,
                nameById,
              );
              return (
                <PlayerIdentityRow
                  key={player.key}
                  name={name}
                  playerKey={player.key}
                  actions={
                    <>
                      <Button
                        size="xs"
                        variant="light"
                        color="orange"
                        disabled={rconDisabled || busy}
                        loading={busy}
                        onClick={() =>
                          void runAction(player.key, () =>
                            props.onKickPlayer(props.serverId, player.key),
                          )
                        }
                      >
                        Kick
                      </Button>
                      <Button
                        size="xs"
                        variant="light"
                        color="red"
                        disabled={rconDisabled || busy}
                        onClick={() => confirmBan(player)}
                      >
                        Ban
                      </Button>
                    </>
                  }
                />
              );
            })}
          </div>
        )}

        <BannedPlayersSection
          serverId={props.serverId}
          nameById={nameById}
          reloadRef={reloadBannedRef}
          onEntriesLoaded={onBannedEntriesLoaded}
        />
      </Stack>
    </AppSurfaceCard>
  );
}
