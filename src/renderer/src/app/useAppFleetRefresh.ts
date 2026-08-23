import { runWithFinally } from "@renderer/shared/async/runWithFinally";
import { useCallback, useEffect, useRef, useState } from "react";
import { showOperatorError, showOperatorToast } from "@ui/operatorToast";
import type {
  AppEvent,
  ClusterComplianceReport,
  InstallationServersMode,
  OfficialNetworkStatus,
  ServerInstallationInfo,
  ServerProfile,
  ServerRuntimeInfo,
  ServerStopProgress,
  SteamCmdConsoleSnapshot,
  SteamCmdStatus,
} from "@shared/types";
import { createGenerationGate } from "@shared/createGenerationGate";
import { getServerUpdateState } from "@shared/server-update-status";
import { reconcileServerList } from "@renderer/shared/reconcileServerList";
import {
  reconcileClusterReports,
  reconcileEvents,
  reconcileInstallationMap,
  reconcileStatusMap,
  reconcileSteamCmdConsole,
  reconcileSteamCmdStatus,
  upsertRuntimeStatus,
} from "@renderer/shared/reconcilePollSnapshots";
import { collectAttentionIssues } from "@features/overview/components/AttentionIssuesPopover/AttentionIssuesPopover";
import type { Overlay } from "@app/appOverlay";
import type { Route } from "@layout/Sidebar/Sidebar";

export type FleetRefreshSnapshot = {
  servers: ServerProfile[] | null;
  statuses: Map<string, ServerRuntimeInfo> | null;
  installationInfo: Map<string, ServerInstallationInfo> | null;
  officialSteamBuild: string | null;
};

export function useAppFleetRefresh(options: {
  route: Route;
  overlay: Overlay | null;
}): {
  servers: ServerProfile[];
  statuses: Map<string, ServerRuntimeInfo>;
  installationInfo: Map<string, ServerInstallationInfo>;
  officialVersion: string | null;
  officialNetworkStatus: OfficialNetworkStatus;
  officialSteamBuild: string | null;
  reports: ClusterComplianceReport[];
  events: AppEvent[];
  steamCmdStatus: SteamCmdStatus | null;
  steamCmdConsole: SteamCmdConsoleSnapshot | null;
  overviewLoading: boolean;
  installScan: { active: boolean; reason: "startup" | "manual" | null };
  stopProgressByServerId: Map<string, ServerStopProgress>;
  steamCmdBusy: boolean;
  refresh: (options?: {
    includeInstallation?: boolean;
    /** When false, skip listServers (status/SteamCMD/events poll only). Default true. */
    includeServerList?: boolean;
    forceOfficialCheck?: boolean;
    serversMode?: InstallationServersMode;
  }) => Promise<FleetRefreshSnapshot>;
  runInstallHealthScan: (reason: "startup" | "manual") => Promise<void>;
} {
  const { route, overlay } = options;

  const [servers, setServers] = useState<ServerProfile[]>([]);
  const [statuses, setStatuses] = useState<Map<string, ServerRuntimeInfo>>(new Map());
  const [installationInfo, setInstallationInfo] = useState<
    Map<string, ServerInstallationInfo>
  >(new Map());
  const [officialVersion, setOfficialVersion] = useState<string | null>(null);
  const [officialNetworkStatus, setOfficialNetworkStatus] =
    useState<OfficialNetworkStatus>("unknown");
  const [officialSteamBuild, setOfficialSteamBuild] = useState<string | null>(null);
  const [reports, setReports] = useState<ClusterComplianceReport[]>([]);
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [steamCmdStatus, setSteamCmdStatus] = useState<SteamCmdStatus | null>(null);
  const [steamCmdConsole, setSteamCmdConsole] = useState<SteamCmdConsoleSnapshot | null>(null);
  const [stopProgressByServerId, setStopProgressByServerId] = useState<
    Map<string, ServerStopProgress>
  >(new Map());
  const [installScan, setInstallScan] = useState<{
    active: boolean;
    reason: "startup" | "manual" | null;
  }>({ active: false, reason: null });
  const installScanInFlightRef = useRef<Promise<void> | null>(null);
  const refreshGenerationGateRef = useRef(createGenerationGate());
  const [overviewLoading, setOverviewLoading] = useState(true);

  const steamCmdBusy = steamCmdStatus?.busy === true;
  const steamCmdBusyRef = useRef(steamCmdBusy);
  const wasSteamCmdBusyRef = useRef(false);

  useEffect(() => {
    steamCmdBusyRef.current = steamCmdBusy;
  }, [steamCmdBusy]);

  const refresh = useCallback(async (refreshOptions?: {
    includeInstallation?: boolean;
    includeServerList?: boolean;
    forceOfficialCheck?: boolean;
    serversMode?: InstallationServersMode;
  }): Promise<FleetRefreshSnapshot> => {
    const includeInstallation = refreshOptions?.includeInstallation !== false;
    const includeServerList = refreshOptions?.includeServerList !== false;
    const forceOfficialCheck = refreshOptions?.forceOfficialCheck === true;
    const serversMode = refreshOptions?.serversMode ?? true;
    const generation = refreshGenerationGateRef.current.begin();
    const [
      serversRes,
      statusesRes,
      installRes,
      steamCmdRes,
      steamCmdConsoleRes,
      clusterRes,
      eventsRes,
    ] = await Promise.all([
      includeServerList
        ? window.api.listServers()
        : Promise.resolve(null),
      window.api.getStatuses(),
      includeInstallation
        ? window.api.getInstallationInfo(forceOfficialCheck, serversMode)
        : Promise.resolve(null),
      window.api.getSteamCmdStatus(),
      window.api.getSteamCmdConsole(140),
      window.api.checkCluster(),
      window.api.recentEvents(100),
    ]);
    if (!refreshGenerationGateRef.current.isCurrent(generation)) {
      return {
        servers: null,
        statuses: null,
        installationInfo: null,
        officialSteamBuild: null,
      };
    }
    if (serversRes !== null && serversRes.ok) {
      setServers((previous) =>
        reconcileServerList(previous, serversRes.data),
      );
    }
    if (statusesRes.ok) {
      setStatuses((previous) =>
        reconcileStatusMap(previous, statusesRes.data),
      );
    }
    if (installRes !== null && installRes.ok) {
      setOfficialVersion((previous) =>
        previous === installRes.data.officialVersion
          ? previous
          : installRes.data.officialVersion,
      );
      setOfficialNetworkStatus((previous) =>
        previous === installRes.data.officialNetworkStatus
          ? previous
          : installRes.data.officialNetworkStatus,
      );
      setOfficialSteamBuild((previous) =>
        previous === installRes.data.officialSteamBuild
          ? previous
          : installRes.data.officialSteamBuild,
      );
      setInstallationInfo((previous) =>
        reconcileInstallationMap(previous, installRes.data.servers),
      );
    }
    if (steamCmdRes.ok) {
      setSteamCmdStatus((previous) =>
        reconcileSteamCmdStatus(previous, steamCmdRes.data),
      );
    }
    if (steamCmdConsoleRes.ok) {
      setSteamCmdConsole((previous) =>
        reconcileSteamCmdConsole(previous, steamCmdConsoleRes.data),
      );
    }

    if (clusterRes.ok) {
      setReports((previous) =>
        reconcileClusterReports(previous, clusterRes.data),
      );
    }
    if (eventsRes.ok) {
      setEvents((previous) => reconcileEvents(previous, eventsRes.data));
    }

    return {
      servers:
        serversRes !== null && serversRes.ok ? serversRes.data : null,
      statuses: statusesRes.ok
        ? new Map(statusesRes.data.map((s) => [s.serverId, s]))
        : null,
      installationInfo:
        installRes !== null && installRes.ok
          ? new Map(installRes.data.servers.map((s) => [s.serverId, s]))
          : null,
      officialSteamBuild:
        installRes !== null && installRes.ok
          ? installRes.data.officialSteamBuild
          : null,
    };
  }, []);

  const runInstallHealthScan = useCallback(
    async (reason: "startup" | "manual") => {
      if (installScanInFlightRef.current !== null) {
        await installScanInFlightRef.current;
        return;
      }

      setInstallScan({ active: true, reason });
      const job = runWithFinally(
        async () => {
          const snapshot = await refresh({
            includeInstallation: true,
            forceOfficialCheck: reason === "manual",
          });
          if (reason !== "manual") {
            return;
          }
          if (
            snapshot.servers === null
            || snapshot.statuses === null
            || snapshot.installationInfo === null
          ) {
            showOperatorError(
              "Try Check Servers Health again in a moment.",
              "Could not finish health check",
            );
            return;
          }
          if (snapshot.servers.length === 0) {
            showOperatorToast({
              title: "No servers to check",
              message: "Add a server first, then run Check Servers Health again.",
              color: "gray",
            });
            return;
          }
          const issues = collectAttentionIssues({
            servers: snapshot.servers,
            statuses: snapshot.statuses,
            installationInfo: snapshot.installationInfo,
            officialSteamBuild: snapshot.officialSteamBuild,
          });
          if (issues.length > 0) {
            showOperatorToast({
              title:
                issues.length === 1
                  ? "1 server needs attention"
                  : `${issues.length} servers need attention`,
              message: "Open the attention badge above the server list for details.",
              color: "orange",
              autoClose: 8000,
            });
            return;
          }
          const unverifiedInstalls = [...snapshot.installationInfo.values()].filter(
            (info) =>
              info.installed
              && getServerUpdateState(info, snapshot.officialSteamBuild) === "unknown",
          ).length;
          if (unverifiedInstalls > 0) {
            showOperatorToast({
              title: "Installs look OK; updates unverified",
              message:
                "Couldn't confirm Steam update status for every server. Try Check server updates.",
              color: "yellow",
            });
            return;
          }
          showOperatorToast({
            title: "All servers look healthy",
            message: "Install folders look good.",
          });
        },
        () => {
          setInstallScan({ active: false, reason: null });
        },
      );
      installScanInFlightRef.current = job;
      await runWithFinally(
        async () => {
          await job;
        },
        () => {
          if (installScanInFlightRef.current === job) {
            installScanInFlightRef.current = null;
          }
        },
      );
    },
    [refresh],
  );

  useEffect(() => {
    let active = true;
    void refresh({ includeInstallation: false })
      .finally(() => {
        if (active) {
          setOverviewLoading(false);
        }
      })
      .then(() => {
        if (!active) {
          return;
        }
        return runInstallHealthScan("startup");
      });
    const unsubscribeStatus = window.api.onServerStatus((info) => {
      setStatuses((prev) => upsertRuntimeStatus(prev, info));
    });
    const unsubscribeProgress = window.api.onSteamCmdProgress((payload) => {
      setSteamCmdStatus((previous) =>
        reconcileSteamCmdStatus(previous, payload.status),
      );
      setSteamCmdConsole((previous) =>
        reconcileSteamCmdConsole(previous, payload.console),
      );
    });
    const unsubscribeStopProgress = window.api.onServerStopProgress((payload) => {
      setStopProgressByServerId((prev) => {
        const next = new Map(prev);
        if (payload.active) {
          next.set(payload.serverId, payload);
        } else {
          next.delete(payload.serverId);
        }
        return next;
      });
    });
    return () => {
      active = false;
      unsubscribeStatus();
      unsubscribeProgress();
      unsubscribeStopProgress();
    };
  }, [refresh, runInstallHealthScan]);

  useEffect(() => {
    const shouldPollSteamCmd =
      overlay === null && (route === "overview" || route === "downloads");
    if (!shouldPollSteamCmd) {
      return;
    }
    const syncing = steamCmdStatus?.operation === "sync-files";
    const intervalMs = syncing ? 5_000 : steamCmdBusy ? 2_500 : 5_000;
    const interval = setInterval(() => {
      void refresh({
        includeInstallation: false,
        includeServerList: false,
      });
    }, intervalMs);
    return () => {
      clearInterval(interval);
    };
  }, [
    refresh,
    steamCmdBusy,
    steamCmdStatus?.operation,
    route,
    overlay,
  ]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (steamCmdBusyRef.current) {
        return;
      }
      void refresh({
        includeInstallation: true,
        serversMode: "when-official-changed",
      });
    }, 5 * 60_000);
    return () => {
      clearInterval(interval);
    };
  }, [refresh]);

  useEffect(() => {
    if (steamCmdBusy) {
      wasSteamCmdBusyRef.current = true;
      return;
    }
    if (!wasSteamCmdBusyRef.current) {
      return;
    }
    wasSteamCmdBusyRef.current = false;
    void refresh({ includeInstallation: true, forceOfficialCheck: true });
  }, [steamCmdBusy, refresh]);

  return {
    servers,
    statuses,
    installationInfo,
    officialVersion,
    officialNetworkStatus,
    officialSteamBuild,
    reports,
    events,
    steamCmdStatus,
    steamCmdConsole,
    overviewLoading,
    installScan,
    stopProgressByServerId,
    steamCmdBusy,
    refresh,
    runInstallHealthScan,
  };
}
