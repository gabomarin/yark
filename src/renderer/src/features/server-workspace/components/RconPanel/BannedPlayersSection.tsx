import { ActionIcon, Button, Group, Loader, Text, Tooltip } from "@mantine/core";
import { modals } from "@mantine/modals";
import { FileText } from "@phosphor-icons/react";
import type { OnlinePlayerInfo } from "@shared/ipc";
import type { MutableRefObject, ReactElement } from "react";
import { useCallback, useEffect, useState } from "react";
import { showOperatorError, showOperatorToast } from "@ui/operatorToast";
import {
  PlayerIdentityRow,
  resolvePlayerDisplayName,
} from "./PlayerIdentityRow";
import classes from "./RconPanel.module.css";

interface Props {
  serverId: string;
  nameById: ReadonlyMap<string, string>;
  reloadRef?: MutableRefObject<(() => Promise<void>) | null>;
  onEntriesLoaded?: (entries: OnlinePlayerInfo[]) => void;
}

export function BannedPlayersSection(props: Props): ReactElement {
  const { serverId, onEntriesLoaded } = props;
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [banned, setBanned] = useState<OnlinePlayerInfo[]>([]);
  const [bannedLoading, setBannedLoading] = useState(false);
  const [bannedError, setBannedError] = useState<string | null>(null);

  const loadBanned = useCallback(async (): Promise<void> => {
    setBannedLoading(true);
    setBannedError(null);
    try {
      const result = await window.api.listBannedPlayers(serverId);
      if (result.ok) {
        setBanned(result.data);
        onEntriesLoaded?.(result.data);
      } else {
        setBannedError(result.error ?? "Could not read ban list");
      }
    } finally {
      setBannedLoading(false);
    }
  }, [serverId, onEntriesLoaded]);

  useEffect(() => {
    void loadBanned();
  }, [loadBanned]);

  useEffect(() => {
    if (!props.reloadRef) return;
    props.reloadRef.current = loadBanned;
    return () => {
      if (props.reloadRef) {
        props.reloadRef.current = null;
      }
    };
  }, [loadBanned, props.reloadRef]);

  const openBanList = async (): Promise<void> => {
    const result = await window.api.openBanListFile(props.serverId);
    if (!result.ok) {
      showOperatorError(result.error ?? "Could not open BanList.txt");
    }
  };

  const confirmUnban = (player: OnlinePlayerInfo): void => {
    const label = resolvePlayerDisplayName(
      player.key,
      player.name,
      props.nameById,
    );
    modals.openConfirmModal({
      title: "Unban player?",
      children: (
        <Text size="sm">
          Remove <strong>{label}</strong> from the ban list?
        </Text>
      ),
      labels: { confirm: "Unban", cancel: "Cancel" },
      onConfirm: () => {
        void (async () => {
          setActionKey(player.key);
          try {
            const result = await window.api.unbanPlayer(
              props.serverId,
              player.key,
            );
            if (result.ok) {
              setBanned(result.data.banned);
              if (result.data.warning) {
                showOperatorToast({
                  title: "Unban",
                  message: result.data.warning,
                  color: "orange",
                  autoClose: 8000,
                });
              }
            } else {
              setBannedError(result.error ?? "Unban failed");
            }
          } finally {
            setActionKey(null);
          }
        })();
      },
    });
  };

  return (
    <div className={classes.bannedSection}>
      <div className={classes.header}>
        <Text className={classes.title}>Banned</Text>
        <Tooltip label="Open BanList.txt">
          <ActionIcon
            size="sm"
            variant="default"
            aria-label="Open BanList.txt"
            onClick={() => void openBanList()}
          >
            <FileText size={14} />
          </ActionIcon>
        </Tooltip>
      </div>

      {bannedError !== null ? (
        <Text size="sm" c="red">
          {bannedError}
        </Text>
      ) : bannedLoading && banned.length === 0 ? (
        <Group gap="xs">
          <Loader size="xs" />
          <Text size="sm" c="dimmed">
            Loading…
          </Text>
        </Group>
      ) : banned.length === 0 ? (
        <Text size="sm" c="dimmed">
          No bans.
        </Text>
      ) : (
        <div className={classes.playerList}>
          {banned.map((player) => {
            const busy = actionKey === player.key;
            const name = resolvePlayerDisplayName(
              player.key,
              player.name,
              props.nameById,
            );
            return (
              <PlayerIdentityRow
                key={player.key}
                name={name}
                playerKey={player.key}
                actions={
                  <Button
                    size="xs"
                    variant="default"
                    disabled={busy}
                    loading={busy}
                    aria-label={`Unban ${name}`}
                    onClick={() => confirmUnban(player)}
                  >
                    Unban
                  </Button>
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
