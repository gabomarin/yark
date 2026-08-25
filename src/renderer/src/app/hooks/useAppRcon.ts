import { useCallback, useEffect, useRef, useState } from "react";
import { showOperatorError } from "@ui/operatorToast";
import type { RconHistoryEntry } from "@features/server-workspace/ServerWorkspacePage";
import type { PlayerListState } from "@features/server-workspace/components/RconPanel/PlayerListSection";
import type { OnlinePlayerInfo, PlayerListUpdatedPush } from "@shared/ipc";
import type { InstallationServersMode } from "@shared/types";
import { upsertPlayerListState } from "@renderer/shared/reconcilePollSnapshots";
import type { FleetRefreshSnapshot } from "@app/hooks/useAppFleetRefresh";

export function useAppRcon(options: {
  refresh: (refreshOptions?: {
    includeInstallation?: boolean;
    /** When false, skip listServers (status/SteamCMD/events poll only). Default true. */
    includeServerList?: boolean;
    forceOfficialCheck?: boolean;
    serversMode?: InstallationServersMode;
  }) => Promise<FleetRefreshSnapshot>;
}): {
  rconHistoryByServer: Map<string, RconHistoryEntry[]>;
  playerListsByServer: Map<string, PlayerListState>;
  sendRconCommand: (serverId: string, command: string) => Promise<boolean>;
  clearRconHistory: (serverId: string) => void;
  onRconTabFocusChanged: (serverId: string, isFocused: boolean) => Promise<void>;
  onRefreshPlayers: (serverId: string) => Promise<void>;
  onKickPlayer: (serverId: string, playerKey: string) => Promise<boolean>;
  onBanPlayer: (serverId: string, playerKey: string) => Promise<boolean>;
} {
  const { refresh } = options;

  const [rconHistoryByServer, setRconHistoryByServer] = useState<
    Map<string, RconHistoryEntry[]>
  >(new Map());
  const rconHistoryByServerRef = useRef(rconHistoryByServer);
  useEffect(() => {
    rconHistoryByServerRef.current = rconHistoryByServer;
  }, [rconHistoryByServer]);
  const [playerListsByServer, setPlayerListsByServer] = useState<
    Map<string, PlayerListState>
  >(new Map());

  const appendRconHistory = useCallback((serverId: string, entry: RconHistoryEntry) => {
    setRconHistoryByServer((prev) => {
      const next = new Map(prev);
      const current = next.get(serverId) ?? [];
      next.set(serverId, [entry, ...current].slice(0, 100));
      return next;
    });
  }, []);

  const patchRconHistory = useCallback(
    (
      serverId: string,
      entryId: string,
      patch: Partial<Pick<RconHistoryEntry, "status" | "response" | "error">>,
    ) => {
      setRconHistoryByServer((prev) => {
        const next = new Map(prev);
        const current = next.get(serverId) ?? [];
        next.set(
          serverId,
          current.map((entry) =>
            entry.id === entryId
              ? {
                  ...entry,
                  ...patch,
                }
              : entry,
          ),
        );
        return next;
      });
    },
    [],
  );

  const sendRconCommand = useCallback(
    async (serverId: string, command: string): Promise<boolean> => {
      const trimmed = command.trim();
      if (trimmed.length === 0) {
        return false;
      }
      // Survive RCON tab remounts: pending lives in App-level history.
      // Ticket: only block an identical command that is already pending.
      const existing = rconHistoryByServerRef.current.get(serverId) ?? [];
      if (
        existing.some(
          (entry) =>
            entry.status === "pending" && entry.command === trimmed,
        )
      ) {
        return false;
      }

      const createdAt = new Date().toISOString();
      const entryId =
        globalThis.crypto?.randomUUID?.() ??
        `${createdAt}-${Math.random().toString(36).slice(2, 10)}`;
      appendRconHistory(serverId, {
        id: entryId,
        command: trimmed,
        createdAt,
        status: "pending",
        response: null,
        error: null,
      });

      const result = await window.api.sendRconCommand(serverId, trimmed);
      await refresh();
      patchRconHistory(serverId, entryId, {
        status: result.ok ? "success" : "error",
        response: result.ok
          ? result.data.trim().length > 0
            ? result.data
            : null
          : null,
        error: result.ok ? null : (result.error ?? "Unknown error"),
      });

      if (!result.ok) {
        showOperatorError(result.error ?? "Unknown error", "RCON command failed");
      }
      return result.ok;
    },
    [appendRconHistory, patchRconHistory, refresh],
  );

  const clearRconHistory = useCallback((serverId: string): void => {
    setRconHistoryByServer((prev) => {
      const next = new Map(prev);
      const current = next.get(serverId) ?? [];
      // Keep in-flight commands so their result can still patch history and
      // identical-submit gating stays correct.
      next.set(
        serverId,
        current.filter((entry) => entry.status === "pending"),
      );
      return next;
    });
  }, []);

  const applyPlayerList = useCallback(
    (serverId: string, players: OnlinePlayerInfo[], error: string | null = null) => {
      setPlayerListsByServer((prev) =>
        upsertPlayerListState(prev, serverId, { players, error, loading: false }),
      );
    },
    [],
  );

  const setPlayerListLoading = useCallback((serverId: string, loading: boolean) => {
    setPlayerListsByServer((prev) => {
      const current = prev.get(serverId) ?? {
        players: [],
        error: null,
        loading: false,
      };
      return upsertPlayerListState(prev, serverId, { ...current, loading });
    });
  }, []);

  const onRconTabFocusChanged = useCallback(
    async (serverId: string, isFocused: boolean): Promise<void> => {
      if (!isFocused) return;
      setPlayerListLoading(serverId, true);
      const result = await window.api.notifyRconTabFocus(serverId, true);
      if (result.ok) {
        applyPlayerList(serverId, result.data, null);
        return;
      }
      setPlayerListsByServer((prev) => {
        const next = new Map(prev);
        const current = next.get(serverId) ?? {
          players: [],
          error: null,
          loading: false,
        };
        next.set(serverId, {
          players: current.players,
          error: result.error ?? "Could not refresh survivors",
          loading: false,
        });
        return next;
      });
    },
    [applyPlayerList, setPlayerListLoading],
  );

  const onRefreshPlayers = useCallback(
    async (serverId: string): Promise<void> => {
      setPlayerListLoading(serverId, true);
      const result = await window.api.refreshPlayerList(serverId);
      if (result.ok) {
        applyPlayerList(serverId, result.data, null);
        return;
      }
      setPlayerListsByServer((prev) => {
        const next = new Map(prev);
        const current = next.get(serverId) ?? {
          players: [],
          error: null,
          loading: false,
        };
        next.set(serverId, {
          players: current.players,
          error: result.error ?? "Could not refresh survivors",
          loading: false,
        });
        return next;
      });
    },
    [applyPlayerList, setPlayerListLoading],
  );

  const onKickPlayer = useCallback(
    async (serverId: string, playerKey: string): Promise<boolean> => {
      const command = `KickPlayer ${playerKey}`;
      const createdAt = new Date().toISOString();
      const entryId =
        globalThis.crypto?.randomUUID?.() ?? `${createdAt}-${Math.random().toString(36).slice(2, 10)}`;
      appendRconHistory(serverId, {
        id: entryId,
        command,
        createdAt,
        status: "pending",
        response: null,
        error: null,
      });
      const result = await window.api.kickPlayer(serverId, playerKey);
      await refresh();
      patchRconHistory(serverId, entryId, {
        status: result.ok ? "success" : "error",
        response: result.ok
          ? result.data.trim().length > 0
            ? result.data
            : null
          : null,
        error: result.ok ? null : result.error ?? "Kick failed",
      });
      if (!result.ok) {
        showOperatorError(result.error ?? "Kick failed", "Kick failed");
        return false;
      }
      return true;
    },
    [appendRconHistory, patchRconHistory, refresh],
  );

  const onBanPlayer = useCallback(
    async (serverId: string, playerKey: string): Promise<boolean> => {
      const command = `BanPlayer ${playerKey}`;
      const createdAt = new Date().toISOString();
      const entryId =
        globalThis.crypto?.randomUUID?.() ?? `${createdAt}-${Math.random().toString(36).slice(2, 10)}`;
      appendRconHistory(serverId, {
        id: entryId,
        command,
        createdAt,
        status: "pending",
        response: null,
        error: null,
      });
      const result = await window.api.banPlayer(serverId, playerKey);
      await refresh();
      patchRconHistory(serverId, entryId, {
        status: result.ok ? "success" : "error",
        response: result.ok
          ? result.data.trim().length > 0
            ? result.data
            : null
          : null,
        error: result.ok ? null : result.error ?? "Ban failed",
      });
      if (!result.ok) {
        showOperatorError(result.error ?? "Ban failed", "Ban failed");
        return false;
      }
      return true;
    },
    [appendRconHistory, patchRconHistory, refresh],
  );

  useEffect(() => {
    const unsubscribePlayers =
      typeof window.api.onPlayerListUpdated === "function"
        ? window.api.onPlayerListUpdated((payload: PlayerListUpdatedPush) => {
            setPlayerListsByServer((prev) =>
              upsertPlayerListState(prev, payload.serverId, {
                players: payload.players,
                error: payload.error,
                loading: false,
              }),
            );
          })
        : () => undefined;
    return () => {
      unsubscribePlayers();
    };
  }, []);

  return {
    rconHistoryByServer,
    playerListsByServer,
    sendRconCommand,
    clearRconHistory,
    onRconTabFocusChanged,
    onRefreshPlayers,
    onKickPlayer,
    onBanPlayer,
  };
}
