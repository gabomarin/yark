import { createElement, useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Alert } from "@mantine/core";
import type {
  ServerProfile,
  SessionPortSet,
  StartServerOptions,
} from "@shared/types";
import type { OsNotificationOpenPush } from "@shared/ipc";
import { isHostPortBusyError, isHostPortProbeError } from "@shared/host-port-probe-errors";
import { runWithFinally } from "@renderer/shared/async/runWithFinally";
import { claimStartBusy, releaseStartBusy } from "@app/model/startBusyGuard";
import type { Overlay } from "@app/model/appOverlay";
import type { Route } from "@layout/Sidebar/Sidebar";
import type { ServerLogsFocus } from "@features/logs/ServerLogsPanel";
import { openHostPortProbeModal } from "@features/servers/hostPortProbeModal";
import { openDangerConfirmModal } from "@ui/DangerConfirmModal/openDangerConfirmModal";
import { showOperatorError, showOperatorToast } from "@ui/operatorToast";
import type { useAppFleetRefresh } from "@app/hooks/useAppFleetRefresh";

type Refresh = ReturnType<typeof useAppFleetRefresh>["refresh"];
type RunAction = (
  action: () => Promise<{ ok: boolean; error?: string }>,
) => Promise<boolean>;

export function useAppServerLifecycle(options: {
  servers: ServerProfile[];
  openNativeTerminalOnStart: boolean;
  refresh: Refresh;
  runAction: RunAction;
  setOverlay: Dispatch<SetStateAction<Overlay>>;
  setRoute: Dispatch<SetStateAction<Route>>;
  openYarkUpdateSettings: () => void;
}) {
  const {
    servers,
    openNativeTerminalOnStart,
    refresh,
    runAction,
    setOverlay,
    setRoute,
    openYarkUpdateSettings,
  } = options;
  const [startBusyByServerId, setStartBusyByServerId] = useState<Set<string>>(
    () => new Set(),
  );
  const startBusyByServerIdRef = useRef<Set<string>>(new Set());

  const startServer = useCallback(
    async (id: string, startOptions?: StartServerOptions) => {
      if (!claimStartBusy(startBusyByServerIdRef, id)) {
        return;
      }
      setStartBusyByServerId(new Set(startBusyByServerIdRef.current));
      await runWithFinally(
        async () => {
          const result = await window.api.startServer(id, {
            openNativeConsole: openNativeTerminalOnStart,
            ...startOptions,
          });
          if (!result.ok) {
            const message = result.error ?? "Unknown error";
            if (isHostPortProbeError(message)) {
              const server = servers.find((item) => item.id === id);
              openHostPortProbeModal({
                serverName: server?.name ?? id,
                message,
                onEditPorts: () => {
                  setRoute("overview");
                  setOverlay({ kind: "workspace", serverId: id, initialTab: "server" });
                },
                onStartThisSession: (ports: SessionPortSet) => {
                  void startServer(id, { sessionPorts: ports });
                },
                onStartAnyway: isHostPortBusyError(message)
                  ? undefined
                  : () => {
                      void startServer(id, { skipPortValidation: true });
                    },
              });
            } else {
              showOperatorError(message, "Could not start server");
            }
          } else if (startOptions?.sessionPorts != null) {
            const ports = startOptions.sessionPorts;
            showOperatorToast({
              title: "Started with session ports",
              message: `Running on game ${ports.gamePort} / query ${ports.queryPort} / RCON ${ports.rconPort}. Saved profile ports are unchanged.`,
            });
          }
          await refresh();
        },
        () => {
          releaseStartBusy(startBusyByServerIdRef, id);
          setStartBusyByServerId(new Set(startBusyByServerIdRef.current));
        },
      );
    },
    [openNativeTerminalOnStart, refresh, servers, setOverlay, setRoute],
  );

  const restartServer = useCallback(
    async (id: string, restartOptions?: StartServerOptions) => {
      if (!claimStartBusy(startBusyByServerIdRef, id)) {
        return;
      }
      setStartBusyByServerId(new Set(startBusyByServerIdRef.current));
      await runWithFinally(
        async () => {
          const result = await window.api.restartServer(id, {
            openNativeConsole: openNativeTerminalOnStart,
            ...restartOptions,
          });
          if (!result.ok) {
            const message = result.error ?? "Could not restart the server";
            if (isHostPortProbeError(message)) {
              const server = servers.find((item) => item.id === id);
              openHostPortProbeModal({
                serverName: server?.name ?? id,
                message,
                onEditPorts: () => {
                  setRoute("overview");
                  setOverlay({ kind: "workspace", serverId: id, initialTab: "server" });
                },
                onStartThisSession: (ports: SessionPortSet) => {
                  void startServer(id, { sessionPorts: ports });
                },
                onStartAnyway: isHostPortBusyError(message)
                  ? undefined
                  : () => {
                      void startServer(id, { skipPortValidation: true });
                    },
              });
            } else {
              showOperatorError(message, "Could not restart server");
            }
          } else if (restartOptions?.sessionPorts != null) {
            const ports = restartOptions.sessionPorts;
            showOperatorToast({
              title: "Restarted with session ports",
              message: `Running on game ${ports.gamePort} / query ${ports.queryPort} / RCON ${ports.rconPort}. Saved profile ports are unchanged.`,
            });
          }
          await refresh();
        },
        () => {
          releaseStartBusy(startBusyByServerIdRef, id);
          setStartBusyByServerId(new Set(startBusyByServerIdRef.current));
        },
      );
    },
    [
      openNativeTerminalOnStart,
      refresh,
      servers,
      setOverlay,
      setRoute,
      startServer,
    ],
  );

  const confirmKillServer = useCallback(
    (id: string) => {
      const server = servers.find((item) => item.id === id);
      const label = server?.name ?? id;
      openDangerConfirmModal({
        title: `Force close "${label}"`,
        children: createElement(
          Alert,
          { color: "red", title: "No save", variant: "light" },
          "Closes the server immediately without saving. This can corrupt the world if it was not saved first. Prefer Stop when possible.",
        ),
        confirmLabel: "Force close",
        onConfirm: () => {
          void runAction(() => window.api.killServer(id));
        },
      });
    },
    [runAction, servers],
  );

  const openServerLogs = useCallback(
    (serverId: string, focus?: ServerLogsFocus) => {
      setRoute("overview");
      setOverlay({
        kind: "workspace",
        serverId,
        initialTab: "logs",
        logsFocus: focus ?? { section: "events" },
      });
    },
    [setOverlay, setRoute],
  );

  useEffect(() => {
    if (typeof window.api.onOsNotificationOpen !== "function") {
      return;
    }
    return window.api.onOsNotificationOpen((payload: OsNotificationOpenPush) => {
      if (payload.kind === "crash") {
        openServerLogs(payload.serverId, {
          section: "events",
          eventId: payload.eventId,
        });
        return;
      }
      if (payload.kind === "yarkUpdate") {
        openYarkUpdateSettings();
        return;
      }
      setOverlay(null);
      setRoute("downloads");
    });
  }, [openServerLogs, openYarkUpdateSettings, setOverlay, setRoute]);

  const openServerBackups = useCallback(
    (serverId: string) => {
      setRoute("overview");
      setOverlay({ kind: "workspace", serverId, initialTab: "backups" });
    },
    [setOverlay, setRoute],
  );

  const setServerEnabled = useCallback(
    (id: string, enabled: boolean) =>
      runAction(() => window.api.setServerEnabled(id, enabled)),
    [runAction],
  );

  return {
    startBusyByServerId,
    startServer,
    restartServer,
    confirmKillServer,
    openServerLogs,
    openServerBackups,
    setServerEnabled,
  };
}
