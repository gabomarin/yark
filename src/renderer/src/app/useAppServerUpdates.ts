import { useCallback, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { notifications } from "@mantine/notifications";
import { runWithFinally } from "@renderer/shared/async/runWithFinally";
import type {
  ServerInstallationInfo,
  ServerProfile,
  ServerRuntimeInfo,
  SteamCmdStatus,
} from "@shared/types";
import {
  getServerUpdateState,
  isServerUpdateAvailable,
} from "@shared/server-update-status";
import {
  buildUpdateAllOutdatedPlan,
  canOpenUpdateAllOutdated,
  classifyUpdateAllOutdatedQueueResult,
  summarizeUpdateAllOutdatedQueue,
  type UpdateAllOutdatedPlan,
} from "@features/overview/updateAllOutdatedModel";
import type { Overlay } from "@app/appOverlay";
import type { Route } from "@layout/Sidebar/Sidebar";
import { showOperatorError, showOperatorToast } from "@ui/operatorToast";
import type { useAppFleetRefresh } from "@app/useAppFleetRefresh";

type Refresh = ReturnType<typeof useAppFleetRefresh>["refresh"];

export function useAppServerUpdates(options: {
  servers: ServerProfile[];
  installationInfo: Map<string, ServerInstallationInfo>;
  statuses: Map<string, ServerRuntimeInfo>;
  officialSteamBuild: string | null;
  steamCmdStatus: SteamCmdStatus | null;
  refresh: Refresh;
  setOverlay: Dispatch<SetStateAction<Overlay>>;
  setRoute: Dispatch<SetStateAction<Route>>;
}) {
  const {
    servers,
    installationInfo,
    statuses,
    officialSteamBuild,
    steamCmdStatus,
    refresh,
    setOverlay,
    setRoute,
  } = options;
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [updateAllOutdatedOpen, setUpdateAllOutdatedOpen] = useState(false);
  const [updateAllOutdatedModalPlan, setUpdateAllOutdatedModalPlan] =
    useState<UpdateAllOutdatedPlan | null>(null);
  const [updateAllOutdatedLoading, setUpdateAllOutdatedLoading] = useState(false);
  const [updateAllOutdatedQueueing, setUpdateAllOutdatedQueueing] = useState(false);

  const updateAllOutdatedPlan = useMemo(
    () =>
      buildUpdateAllOutdatedPlan({
        servers,
        installationInfo,
        statuses,
        officialSteamBuild,
        criticalJobs: steamCmdStatus?.criticalJobs,
      }),
    [servers, installationInfo, statuses, officialSteamBuild, steamCmdStatus?.criticalJobs],
  );
  const canUpdateAllOutdated = canOpenUpdateAllOutdated(updateAllOutdatedPlan);

  const checkForUpdates = useCallback(
    async (serverId?: string) => {
      setCheckingUpdates(true);
      await runWithFinally(
        async () => {
          const snapshot = await refresh({
            includeInstallation: true,
            forceOfficialCheck: true,
            includeServerList: false,
          });
          if (snapshot.installationInfo === null) {
            showOperatorError(
              "Could not check for updates",
              "Could not check for updates",
            );
            return;
          }
          const next = snapshot.installationInfo;
          const officialBuild = snapshot.officialSteamBuild;

          if (serverId !== undefined) {
            const info = next.get(serverId);
            const name = servers.find((server) => server.id === serverId)?.name ?? serverId;
            if (info === undefined || !info.installed) {
              notifications.show({
                title: "Not installed yet",
                message: `Install files for "${name}" before checking for updates.`,
                color: "yellow",
              });
              return;
            }
            if (officialBuild == null) {
              notifications.show({
                title: "Couldn't check",
                message: "Couldn't reach Steam right now. Check your internet and try again.",
                color: "red",
              });
              return;
            }
            if (info.steamBuild == null) {
              notifications.show({
                title: "Couldn't check",
                message: `Couldn't read the installed version for "${name}". Try Install or Verify files first.`,
                color: "yellow",
              });
              return;
            }
            if (isServerUpdateAvailable(info, officialBuild)) {
              notifications.show({
                title: "Update available",
                message: `"${name}" has a newer version. Use Update on the server card when you're ready.`,
                color: "orange",
                autoClose: 8000,
              });
            } else {
              notifications.show({
                title: "Up to date",
                message: `"${name}" is already on the latest version.`,
                color: "teal",
              });
            }
            return;
          }

          const serversInfo = [...next.values()];
          const outdated = serversInfo.filter((info) =>
            isServerUpdateAvailable(info, officialBuild),
          );
          const unverified = serversInfo.filter(
            (info) =>
              info.installed
              && getServerUpdateState(info, officialBuild) === "unknown",
          );
          if (outdated.length === 0) {
            if (unverified.length > 0) {
              notifications.show({
                title: "Couldn't check every server",
                message: `${unverified.length} server${unverified.length === 1 ? "" : "s"} don't have a version to compare. Try Install or Verify on ${unverified.length === 1 ? "that server" : "those servers"}.`,
                color: "yellow",
              });
            } else {
              notifications.show({
                title: "You're up to date",
                message: "All installed servers are on the latest version.",
                color: "teal",
              });
            }
          } else {
            const names = outdated
              .map((info) => {
                const name =
                  servers.find((server) => server.id === info.serverId)?.name
                  ?? info.serverId;
                return `"${name}"`;
              })
              .join(", ");
            notifications.show({
              title:
                outdated.length === 1
                  ? "Update available"
                  : `${outdated.length} updates available`,
              message:
                outdated.length === 1
                  ? `${names} has a newer version. Use Update on the server card when you're ready.`
                  : `${names} have newer versions. Use Update on each server card when you're ready.`,
              color: "orange",
              autoClose: 10000,
            });
          }
        },
        () => {
          setCheckingUpdates(false);
        },
      );
    },
    [refresh, servers],
  );

  const openUpdateAllOutdated = useCallback(async () => {
    setUpdateAllOutdatedLoading(true);
    setUpdateAllOutdatedModalPlan(null);
    await runWithFinally(
      async () => {
        const snapshot = await refresh({
          includeInstallation: true,
          forceOfficialCheck: true,
          includeServerList: false,
        });
        if (snapshot.installationInfo === null) {
          showOperatorError(
            "Could not refresh update status",
            "Could not refresh update status",
          );
          return;
        }
        const nextPlan = buildUpdateAllOutdatedPlan({
          servers,
          installationInfo: snapshot.installationInfo,
          statuses,
          officialSteamBuild: snapshot.officialSteamBuild,
          criticalJobs: steamCmdStatus?.criticalJobs,
        });
        if (nextPlan.rows.length === 0) {
          showOperatorToast({
            title: "No outdated servers",
            message: "Every installed server is already on the latest Steam build.",
            color: "teal",
          });
          return;
        }
        setUpdateAllOutdatedModalPlan(nextPlan);
        setUpdateAllOutdatedOpen(true);
      },
      () => {
        setUpdateAllOutdatedLoading(false);
      },
    );
  }, [refresh, servers, statuses, steamCmdStatus?.criticalJobs]);

  const closeUpdateAllOutdated = useCallback(() => {
    setUpdateAllOutdatedOpen(false);
    setUpdateAllOutdatedModalPlan(null);
  }, []);

  const confirmUpdateAllOutdated = useCallback(async () => {
    setUpdateAllOutdatedQueueing(true);
    await runWithFinally(
      async () => {
        try {
          const plan = buildUpdateAllOutdatedPlan({
            servers,
            installationInfo,
            statuses,
            officialSteamBuild,
            criticalJobs: steamCmdStatus?.criticalJobs,
          });
          let queuedCount = 0;
          let replacedCount = 0;
          let failedCount = 0;
          let alreadyQueuedCount = 0;

          for (const row of plan.eligible) {
            const result = await window.api.enqueueUpdateServer(row.serverId);
            const classified = classifyUpdateAllOutdatedQueueResult({
              ok: result.ok,
              error: result.ok ? undefined : result.error,
            });
            switch (classified.action) {
              case "queued":
                queuedCount += 1;
                break;
              case "replaced-verify":
                replacedCount += 1;
                break;
              case "already-in-downloads":
                alreadyQueuedCount += 1;
                break;
              case "failed":
                failedCount += 1;
                break;
            }
          }

          void refresh().catch(() => undefined);
          const summary = summarizeUpdateAllOutdatedQueue({
            queuedCount,
            replacedCount: replacedCount + alreadyQueuedCount,
            failedCount,
            skippedCount: plan.skipped.length,
          });
          showOperatorToast({
            title: summary.title,
            message: summary.message,
            color: summary.color,
            autoClose: 10000,
            onClick: () => {
              setOverlay(null);
              setRoute("downloads");
            },
          });
        } catch (error) {
          showOperatorError(
            error instanceof Error
              ? error.message
              : "Something went wrong queueing updates.",
            "Could not queue updates",
          );
        }
      },
      () => {
        setUpdateAllOutdatedQueueing(false);
        setUpdateAllOutdatedOpen(false);
        setUpdateAllOutdatedModalPlan(null);
      },
    );
  }, [
    installationInfo,
    officialSteamBuild,
    refresh,
    servers,
    setOverlay,
    setRoute,
    statuses,
    steamCmdStatus?.criticalJobs,
  ]);

  return {
    checkingUpdates,
    checkForUpdates,
    canUpdateAllOutdated,
    updateAllOutdatedLoading,
    openUpdateAllOutdated,
    updateAllOutdatedOpen,
    updateAllOutdatedModalPlan,
    updateAllOutdatedQueueing,
    closeUpdateAllOutdated,
    confirmUpdateAllOutdated,
  };
}
