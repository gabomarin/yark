import { runWithFinally } from "@renderer/shared/async/runWithFinally";
import type { ReactElement } from "react";
import { HardDrives } from "@phosphor-icons/react";
import { Button, Group, Select, Stack, Text, Title } from "@mantine/core";
import { PageScaffold } from "@layout/PageScaffold/PageScaffold";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";
import { EmptyState } from "@ui/EmptyState/EmptyState";
import { showOperatorError, showOperatorToast } from "@ui/operatorToast";
import type {
  BackupCleanupOptions,
  BackupCleanupPreview,
  BackupDiskAlertSettings,
  BackupFleetSummary,
  ServerProfile,
} from "@shared/types";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  isBackupDiskDraftDirty,
  isBackupPolicyDraftDirty,
  toBackupPolicyDraft,
  type BackupPolicyDraft,
} from "./backupPolicyDraft";
import {
  type BackupHealthFilter,
  formatBackupBytes,
} from "./backupsPageModel";
import {
  BackupFleetAlertsPanel,
  type OpenFailedBackupLogsArgs,
} from "./components/BackupFleetAlertsPanel/BackupFleetAlertsPanel";
import { BackupFleetMetrics } from "./components/BackupFleetMetrics/BackupFleetMetrics";
import { BackupCleanupModal } from "./components/BackupCleanupModal/BackupCleanupModal";
import { BackupDiskAlertModal } from "./components/BackupDiskAlertModal/BackupDiskAlertModal";
import { BackupVolumeStrip } from "./components/BackupVolumeStrip/BackupVolumeStrip";
import { ServerHealthCard } from "./components/ServerHealthCard/ServerHealthCard";
import classes from "./BackupsPage.module.css";

interface Props {
  servers: ServerProfile[];
  onOpenServerBackups: (serverId: string) => void;
  onOpenFailedBackupLogs?: (args: OpenFailedBackupLogsArgs) => void;
}

type DraftPolicy = BackupPolicyDraft;

const DEFAULT_CLEANUP: BackupCleanupOptions = {
  serverIds: null,
  includeFailed: true,
  enforceRetention: true,
  olderThanDays: null,
  keepLastPerKind: null,
  protectNewestWorld: true,
};

export function BackupsPage(props: Props): ReactElement {
  const [summary, setSummary] = useState<BackupFleetSummary | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftPolicy>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [browsingId, setBrowsingId] = useState<string | null>(null);
  const [healthFilter, setHealthFilter] = useState<BackupHealthFilter>("all");
  const [diskModalOpen, setDiskModalOpen] = useState(false);
  const [diskDraft, setDiskDraft] = useState<BackupDiskAlertSettings | null>(null);
  const [diskBusy, setDiskBusy] = useState(false);
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [cleanupOptions, setCleanupOptions] = useState<BackupCleanupOptions>(DEFAULT_CLEANUP);
  const [cleanupPreview, setCleanupPreview] = useState<BackupCleanupPreview | null>(null);
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [olderThanEnabled, setOlderThanEnabled] = useState(false);
  const [olderThanDays, setOlderThanDays] = useState(30);
  const [keepLastEnabled, setKeepLastEnabled] = useState(false);
  const [keepLastPerKind, setKeepLastPerKind] = useState(5);

  const loadGenerationRef = useRef(0);
  const load = async (opts?: {
    quiet?: boolean;
    /** Replace local drafts from server (Refresh). Default merges and keeps dirty edits. */
    forceDraftSync?: boolean;
    cancelled?: () => boolean;
  }) => {
    const quiet = opts?.quiet === true;
    const forceDraftSync = opts?.forceDraftSync === true;
    const cancelled = opts?.cancelled;
    // Non-quiet loads bump the generation. Quiet loads snapshot it so a slow
    // onBackupsChanged update no-ops if a newer Refresh starts mid-flight.
    const generation = quiet
      ? loadGenerationRef.current
      : ++loadGenerationRef.current;
    if (!quiet) {
      setLoading(true);
    }
    await runWithFinally(
      async () => {
        if (props.servers.length === 0) {
          if (cancelled?.()) return;
          if (generation !== loadGenerationRef.current) return;
          setSummary(null);
          setDrafts({});
          return;
        }

        const result = await window.api.getBackupFleetSummary();
        if (cancelled?.()) return;
        if (generation !== loadGenerationRef.current) return;
        if (!result.ok) {
          setSummary(null);
          showOperatorError(
            result.error ?? "Could not load backup summary",
            "Could not load backups",
          );
          return;
        }

        setSummary(result.data);
        // Quiet refresh must not clobber in-progress policy edits.
        // Non-quiet also keeps dirty drafts unless Refresh forces a sync (poll must not wipe toggles).
        if (!quiet) {
          setDrafts((previous) => {
            const nextDrafts: Record<string, DraftPolicy> = {};
            for (const row of result.data.servers) {
              const existing = previous[row.serverId];
              if (
                !forceDraftSync &&
                existing !== undefined &&
                isBackupPolicyDraftDirty(existing, row.policy)
              ) {
                nextDrafts[row.serverId] = existing;
              } else {
                nextDrafts[row.serverId] = toBackupPolicyDraft(row.policy);
              }
            }
            return nextDrafts;
          });
          setDiskDraft((previous) => {
            if (
              !forceDraftSync &&
              previous !== null &&
              isBackupDiskDraftDirty(previous, result.data.diskSettings)
            ) {
              return previous;
            }
            return result.data.diskSettings;
          });
        }
      },
      () => {
        // Quiet updates never own the spinner; only the latest non-quiet load clears it.
        if (!quiet && generation === loadGenerationRef.current) {
          setLoading(false);
        }
      },
    );
  };

  // Reload when the server set changes. Live backup updates use onBackupsChanged;
  // App no longer heartbeats listServers off the Servers list.
  const serverIdsKey = useMemo(
    () => props.servers.map((server) => server.id).join("\0"),
    [props.servers],
  );

  useEffect(() => {
    let cancelled = false;
    void load({ cancelled: () => cancelled });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: serverIdsKey, not servers ref
  }, [serverIdsKey]);

  useEffect(() => {
    if (typeof window.api.onBackupsChanged !== "function") return undefined;
    return window.api.onBackupsChanged(() => {
      void load({ quiet: true });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- subscribe once per server set
  }, [serverIdsKey]);

  const filteredServers = useMemo(() => {
    const rows = summary?.servers ?? [];
    if (healthFilter === "protected") {
      return rows.filter((row) => row.health === "ok");
    }
    if (healthFilter === "at_risk") {
      return rows.filter((row) => row.health === "warning" || row.health === "critical");
    }
    if (healthFilter === "failed") {
      return rows.filter((row) => row.counts.failed24h > 0);
    }
    return rows;
  }, [summary, healthFilter]);

  // Quiet = no files, no risk, no enabled schedules. `protectedCount` is
  // fleet health === "ok", not "a policy row exists".
  const backupFleetQuiet =
    summary !== null &&
    summary.stats.totalBackupBytes === 0 &&
    summary.stats.failed24h === 0 &&
    summary.stats.atRiskCount === 0 &&
    summary.stats.protectedCount === 0 &&
    summary.servers.every((row) => !row.policy.enabled);

  const savePolicy = async (serverId: string) => {
    const draft = drafts[serverId];
    if (draft === undefined) return;
    setBusyId(serverId);
    await runWithFinally(
      async () => {
        const result = await window.api.setBackupPolicy(serverId, draft);
        if (!result.ok) {
          showOperatorError(
            result.error ?? "Could not save backup policy",
            "Could not save backup settings",
          );
          return;
        }
        // Toast before refresh so a failed reload cannot precede a success message.
        showOperatorToast({
          title: "Saved",
          message: "Saved backup settings for the selected server.",
        });
        await load({ quiet: true });
      },
      () => {
        setBusyId(null);
      },
    );
  };

  const browseBackupDir = async (server: ServerProfile) => {
    const draft = drafts[server.id];
    if (draft === undefined) return;
    setBrowsingId(server.id);
    await runWithFinally(
      async () => {
        const result = await window.api.pickPath(
          "directory",
          draft.backupDir ?? server.installDir,
          `Backup destination for ${server.name}`,
        );
        if (!result.ok) {
          showOperatorError(result.error ?? "Could not open folder picker");
          return;
        }
        if (result.data !== null) {
          setDrafts((previous) => ({
            ...previous,
            [server.id]: { ...draft, backupDir: result.data },
          }));
        }
      },
      () => {
        setBrowsingId(null);
      },
    );
  };

  const openDestination = async (serverId: string) => {
    setBusyId(serverId);
    await runWithFinally(
      async () => {
        const result = await window.api.openBackupRoot(serverId);
        if (!result.ok) {
          showOperatorError(result.error ?? "Could not open backup destination");
        }
      },
      () => {
        setBusyId(null);
      },
    );
  };

  const saveDiskSettings = async () => {
    if (diskDraft === null) return;
    setDiskBusy(true);
    await runWithFinally(
      async () => {
        const result = await window.api.setBackupDiskAlertSettings(diskDraft);
        if (!result.ok) {
          showOperatorError(
            result.error ?? "Could not save disk alert settings",
            "Could not save drive alerts",
          );
          return;
        }
        setDiskModalOpen(false);
        showOperatorToast({
          title: "Saved",
          message: "Backup drive alerts updated.",
        });
        await load();
      },
      () => {
        setDiskBusy(false);
      },
    );
  };

  const dismissFleetAlert = async (alert: {
    id: string;
    fingerprint: string;
  }) => {
    const result = await window.api.dismissBackupFleetAlert(
      alert.id,
      alert.fingerprint,
    );
    if (!result.ok) {
      showOperatorError(result.error ?? "Could not dismiss alert");
      return;
    }
    await load({ quiet: true });
  };

  const buildCleanupPayload = (): BackupCleanupOptions => ({
    ...cleanupOptions,
    olderThanDays: olderThanEnabled ? olderThanDays : null,
    keepLastPerKind: keepLastEnabled ? keepLastPerKind : null,
  });

  const runPreviewCleanup = async () => {
    setCleanupBusy(true);
    await runWithFinally(
      async () => {
        const result = await window.api.previewBackupCleanup(buildCleanupPayload());
        if (!result.ok) {
          setCleanupPreview(null);
          showOperatorError(result.error ?? "Could not preview cleanup");
          return;
        }
        setCleanupPreview(result.data);
      },
      () => {
        setCleanupBusy(false);
      },
    );
  };

  const confirmCleanup = async () => {
    if (cleanupPreview === null || cleanupPreview.items.length === 0) return;
    setCleanupBusy(true);
    await runWithFinally(
      async () => {
        const result = await window.api.runBackupCleanup({
          ...buildCleanupPayload(),
          confirmedBackupIds: cleanupPreview.items.map((item) => item.backup.id),
        });
        if (!result.ok) {
          showOperatorError(result.error ?? "Could not run cleanup");
          return;
        }
        setCleanupOpen(false);
        setCleanupPreview(null);
        showOperatorToast({
          title: "Cleanup finished",
          message: `Cleanup removed ${result.data.deleted} backup${result.data.deleted === 1 ? "" : "s"} (${formatBackupBytes(result.data.freedBytes)}).`,
        });
        await load();
      },
      () => {
        setCleanupBusy(false);
      },
    );
  };

  const serverById = useMemo(() => {
    const map = new Map(props.servers.map((server) => [server.id, server]));
    return map;
  }, [props.servers]);

  const openCleanupModal = () => {
    setCleanupOptions(DEFAULT_CLEANUP);
    setCleanupPreview(null);
    setCleanupOpen(true);
  };

  const openCleanupModalFromToolbar = () => {
    setCleanupOptions(DEFAULT_CLEANUP);
    setCleanupPreview(null);
    setOlderThanEnabled(false);
    setKeepLastEnabled(false);
    setCleanupOpen(true);
  };

  return (
    <PageScaffold
      title="Backups"
      fillViewport
      actions={
        <Group gap="sm">
          <Button
            variant="default"
            onClick={() => void load({ forceDraftSync: true })}
            loading={loading}
          >
            Refresh
          </Button>
          <Button
            variant="light"
            disabled={props.servers.length === 0}
            onClick={openCleanupModalFromToolbar}
          >
            Cleanup…
          </Button>
        </Group>
      }
    >
      <Stack gap="md" className={classes.content}>

        {props.servers.length === 0 ? (
          <AppSurfaceCard>
            <EmptyState
              icon={<HardDrives size={22} />}
              title="No servers yet"
              description="Create a server first to configure backups."
            />
          </AppSurfaceCard>
        ) : loading && summary === null ? (
          <AppSurfaceCard>
            <Text c="dimmed">Loading backup health…</Text>
          </AppSurfaceCard>
        ) : summary !== null ? (
          <>
            <BackupFleetAlertsPanel
              alerts={summary.alerts}
              onOpenServerBackups={props.onOpenServerBackups}
              onOpenFailedBackupLogs={props.onOpenFailedBackupLogs}
              onDismissAlert={(alert) => void dismissFleetAlert(alert)}
              onOpenCleanup={openCleanupModal}
            />

            <BackupFleetMetrics
              summary={summary}
              quiet={backupFleetQuiet}
              healthFilter={healthFilter}
              onHealthFilter={setHealthFilter}
              onOpenDiskSettings={() => {
                setDiskDraft(summary.diskSettings);
                setDiskModalOpen(true);
              }}
            />

            {summary.disks.length > 0 && !backupFleetQuiet && (
              <BackupVolumeStrip
                disks={summary.disks}
                diskSettings={summary.diskSettings}
              />
            )}

            <Group justify="space-between" align="center" wrap="wrap">
              <Title order={4}>Servers</Title>
              <Select
                aria-label="Filter servers by health"
                value={healthFilter}
                onChange={(value) =>
                  setHealthFilter((value as BackupHealthFilter) ?? "all")
                }
                data={[
                  { value: "all", label: "All" },
                  { value: "protected", label: "Protected" },
                  { value: "at_risk", label: "At risk" },
                  { value: "failed", label: "Failed (24h)" },
                ]}
                w={160}
              />
            </Group>

            <Stack gap="sm">
              {filteredServers.length === 0 ? (
                <AppSurfaceCard>
                  <EmptyState
                    icon={<HardDrives size={22} />}
                    title="No matches"
                    description="No servers match this filter."
                  />
                </AppSurfaceCard>
              ) : (
                filteredServers.map((row) => {
                  const draft = drafts[row.serverId];
                  const expanded = expandedId === row.serverId;
                  const busy = busyId === row.serverId;
                  const server = serverById.get(row.serverId);
                  return (
                    <ServerHealthCard
                      key={row.serverId}
                      row={row}
                      draft={draft}
                      expanded={expanded}
                      busy={busy}
                      browsing={browsingId === row.serverId}
                      server={server}
                      onToggleExpand={() =>
                        setExpandedId(expanded ? null : row.serverId)
                      }
                      onOpenDestination={() => void openDestination(row.serverId)}
                      onOpenServer={() => props.onOpenServerBackups(row.serverId)}
                      onBrowse={() => server && void browseBackupDir(server)}
                      onDraftChange={(next) =>
                        setDrafts((previous) => ({
                          ...previous,
                          [row.serverId]: next,
                        }))
                      }
                      onSave={() => void savePolicy(row.serverId)}
                    />
                  );
                })
              )}
            </Stack>
          </>
        ) : null}
      </Stack>

      <BackupDiskAlertModal
        opened={diskModalOpen}
        onClose={() => setDiskModalOpen(false)}
        diskDraft={diskDraft}
        onDiskDraftChange={setDiskDraft}
        busy={diskBusy}
        onSave={() => void saveDiskSettings()}
      />

      <BackupCleanupModal
        opened={cleanupOpen}
        busy={cleanupBusy}
        onClose={() => setCleanupOpen(false)}
        cleanupOptions={cleanupOptions}
        onCleanupOptionsChange={setCleanupOptions}
        olderThanEnabled={olderThanEnabled}
        onOlderThanEnabledChange={setOlderThanEnabled}
        olderThanDays={olderThanDays}
        onOlderThanDaysChange={setOlderThanDays}
        keepLastEnabled={keepLastEnabled}
        onKeepLastEnabledChange={setKeepLastEnabled}
        keepLastPerKind={keepLastPerKind}
        onKeepLastPerKindChange={setKeepLastPerKind}
        cleanupPreview={cleanupPreview}
        onClearPreview={() => setCleanupPreview(null)}
        onPreview={() => void runPreviewCleanup()}
        onConfirm={() => void confirmCleanup()}
      />
    </PageScaffold>
  );
}
