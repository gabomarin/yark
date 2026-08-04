import { ActionIcon, Group, Text, Tooltip } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { Copy } from "@phosphor-icons/react";
import type { ReactElement, ReactNode } from "react";
import classes from "./RconPanel.module.css";

export function resolvePlayerDisplayName(
  key: string,
  explicitName: string | null | undefined,
  nameById: ReadonlyMap<string, string>,
): string {
  if (explicitName && explicitName.trim().length > 0) {
    return explicitName.trim();
  }
  return nameById.get(key.toLowerCase()) ?? "Unknown";
}

export function mergeNameHints(
  previous: Map<string, string>,
  players: Array<{ key: string; name: string | null | undefined }>,
): Map<string, string> {
  const next = new Map(previous);
  for (const player of players) {
    const name = player.name?.trim();
    if (!name) continue;
    next.set(player.key.toLowerCase(), name);
  }
  return next;
}

async function copyPlayerId(playerKey: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(playerKey);
    notifications.show({
      color: "teal",
      message: "Player ID copied",
      autoClose: 1500,
    });
  } catch {
    notifications.show({
      color: "red",
      message: "Could not copy player ID",
    });
  }
}

interface Props {
  name: string;
  playerKey: string;
  actions?: ReactNode;
}

/** Username on top, ID below, actions on the right. */
export function PlayerIdentityRow(props: Props): ReactElement {
  return (
    <div className={classes.playerItem}>
      <div className={classes.playerMeta}>
        <Text size="sm" className={classes.playerName}>
          {props.name}
        </Text>
        <Group gap={4} wrap="nowrap" align="center">
          <Text className={classes.playerId} title={props.playerKey}>
            {props.playerKey}
          </Text>
          <Tooltip label="Copy ID">
            <ActionIcon
              size="xs"
              variant="subtle"
              aria-label={`Copy ID for ${props.name}`}
              onClick={() => void copyPlayerId(props.playerKey)}
            >
              <Copy size={12} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </div>
      {props.actions ? (
        <div className={classes.playerActions}>{props.actions}</div>
      ) : null}
    </div>
  );
}
