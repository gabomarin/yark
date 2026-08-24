import type { ServerStatus } from "@shared/types";
import type { PlayerListState } from "@features/server-workspace/components/RconPanel/PlayerListSection";

/** Snapshot of the ListPlayers cache used for survivor counts (#301). */
export type SurvivorListSnapshot = Pick<
  PlayerListState,
  "players" | "error" | "loading"
> | null;

/**
 * Known online survivor count for a running server, or `null` when the UI must
 * show `–` (not running, RCON error, or no successful list yet). #301 / #228.
 */
export function resolveServerSurvivorCount(input: {
  status: ServerStatus;
  survivorList: SurvivorListSnapshot;
}): number | null {
  if (input.status !== "running") {
    return null;
  }
  const list = input.survivorList;
  if (list == null) {
    return null;
  }
  if (list.error != null) {
    return null;
  }
  if (list.loading && list.players.length === 0) {
    return null;
  }
  return list.players.length;
}

export function formatServerSurvivorMeta(input: {
  status: ServerStatus;
  survivorList: SurvivorListSnapshot;
  maxPlayers: number;
}): string {
  const count = resolveServerSurvivorCount(input);
  if (count === null) {
    return "–";
  }
  return `${count}/${input.maxPlayers}`;
}
