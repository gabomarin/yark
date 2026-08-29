import {
  ActionIcon,
  Button,
  Group,
  Loader,
  Stack,
  Tabs,
  Text,
  Tooltip,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { ArrowClockwise } from "@phosphor-icons/react";
import type { OnlinePlayerInfo } from "@shared/ipc";
import type { ReactElement } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";
import { runWithFinally } from "@renderer/shared/async/runWithFinally";
import { BannedPlayersSection } from "./BannedPlayersSection";
import { AdminsSection } from "./AdminsSection";
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
  /** Blocks admin-list GUS writes while INI Files is dirty. */
  iniDirty?: boolean;
  /** Focus Survivors/Admins sub-tab once (e.g. from INI AdminListURL link). */
  playersPanelFocus?: "survivors" | "admins" | null;
  onPlayersPanelFocusConsumed?: () => void;
}

export function PlayerListSection(props: Props): ReactElement {
  const [panelTab, setPanelTab] = useState<"survivors" | "admins">("survivors");
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [panelRefreshing, setPanelRefreshing] = useState(false);
  const [nameById, setNameById] = useState(() => new Map<string, string>());
  const reloadBannedRef = useRef<(() => Promise<void>) | null>(null);
  const reloadAdminsRef = useRef<(() => Promise<void>) | null>(null);
  const rconDisabled =
    !props.serverRunning || !props.rconConnected || props.playerList.loading;

  useEffect(() => {
    setNameById((previous) =>
      mergeNameHints(previous, props.playerList.players),
    );
  }, [props.playerList.players]);

  useEffect(() => {
    const focus = props.playersPanelFocus;
    if (focus !== "survivors" && focus !== "admins") return;
    setPanelTab(focus);
    props.onPlayersPanelFocusConsumed?.();
  }, [props.playersPanelFocus, props.onPlayersPanelFocusConsumed]);

  const onBannedEntriesLoaded = useCallback((entries: OnlinePlayerInfo[]) => {
    setNameById((previous) => mergeNameHints(previous, entries));
  }, []);

  const refreshAll = async (): Promise<void> => {
    setPanelRefreshing(true);
    await runWithFinally(
      async () => {
        await props.onRefreshPlayers(props.serverId);
        await (reloadBannedRef.current?.() ?? Promise.resolve());
        await (reloadAdminsRef.current?.() ?? Promise.resolve());
      },
      () => {
        setPanelRefreshing(false);
      },
    );
  };

  const runAction = async (
    playerKey: string,
    action: () => Promise<boolean>,
  ): Promise<void> => {
    setActionKey(playerKey);
    await runWithFinally(
      async () => {
        await action();
      },
      () => {
        setActionKey(null);
      },
    );
  };

  const confirmBan = (player: OnlinePlayerInfo): void => {
    const label = resolvePlayerDisplayName(player.key, player.name, nameById);
    modals.openConfirmModal({
      title: "Ban survivor?",
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
      return "No survivors online.";
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

        <Tabs
          value={panelTab}
          onChange={(value) => {
            if (value === "survivors" || value === "admins") {
              setPanelTab(value);
            }
          }}
          keepMounted
          className={classes.playersTabs}
        >
          <Tabs.List grow>
            <Tabs.Tab value="survivors">Survivors</Tabs.Tab>
            <Tabs.Tab value="admins">Admins</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="survivors" pt="sm">
            <Stack gap="sm">
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
                              variant="filled"
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
          </Tabs.Panel>

          <Tabs.Panel value="admins" pt="sm">
            <AdminsSection
              serverId={props.serverId}
              iniDirty={props.iniDirty === true}
              nameById={nameById}
              reloadRef={reloadAdminsRef}
              readOnly={props.serverRunning || props.serverStarting === true}
            />
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </AppSurfaceCard>
  );
}
