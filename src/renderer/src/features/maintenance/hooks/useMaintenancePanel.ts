import { useCallback, useEffect, useState } from "react";
import type { MaintenancePolicy, MaintenancePolicyStatus } from "@shared/types";
import { defaultMaintenancePolicy } from "@shared/maintenance-policy";
import { modals } from "@mantine/modals";
import { maintenancePolicyWriteFromStatus } from "../model/maintenancePanelModel";

type PolicyWrite = Omit<MaintenancePolicy, "serverId" | "updatedAt">;

function idleStatus(serverId: string): MaintenancePolicyStatus {
  return {
    ...defaultMaintenancePolicy(serverId, new Date().toISOString()),
    schedulePaused: false,
    nextRestartAt: null,
    countdownRemainingMs: null,
    countdownPhase: "idle",
    countdownKind: null,
    lastRestartAt: null,
    lastRestartOk: null,
    lastUpdateAt: null,
    lastUpdateOk: null,
    steamUpdateAvailable: false,
    lastWipeAt: null,
    lastWipeOk: null,
    cancelable: false,
  };
}

/** Live Up next poll while the Maintenance tab is open. */
function pollIntervalMs(phase: MaintenancePolicyStatus["countdownPhase"]): number {
  if (
    phase === "last_minute"
    || phase === "restarting"
    || phase === "updating"
    || phase === "wiping"
  ) {
    return 1_000;
  }
  if (phase === "warning") return 3_000;
  // Idle but jobs may arm from the ~60s scheduler — keep Up next honest.
  return 10_000;
}

export function useMaintenancePanel(serverId: string) {
  const [policy, setPolicy] = useState<MaintenancePolicyStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restartOpen, setRestartOpen] = useState(false);
  const [updateOpen, setUpdateOpen] = useState(false);

  const load = useCallback(async () => {
    const result = await window.api.getMaintenancePolicy(serverId);
    if (!result.ok) {
      setError(result.error ?? "Could not load maintenance policy");
      setPolicy(idleStatus(serverId));
      return;
    }
    setError(null);
    setPolicy(result.data);
  }, [serverId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Always poll while this tab is mounted so a scheduler-armed countdown
  // appears even if the first paint was idle (Run restart now used to error
  // with "already active" while Up next still looked idle).
  const phase = policy?.countdownPhase ?? "idle";
  useEffect(() => {
    let id: number | null = null;

    const clear = () => {
      if (id !== null) {
        window.clearInterval(id);
        id = null;
      }
    };

    const arm = () => {
      clear();
      if (document.hidden) return;
      id = window.setInterval(() => {
        void load();
      }, pollIntervalMs(phase));
    };

    const onVisibility = () => {
      if (document.hidden) {
        clear();
        return;
      }
      void load();
      arm();
    };

    arm();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clear();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [phase, load]);

  const save = useCallback(
    async (next: PolicyWrite, options?: { withBusy?: boolean }) => {
      const withBusy = options?.withBusy ?? true;
      if (withBusy) setBusy(true);
      setError(null);
      try {
        const result = await window.api.setMaintenancePolicy(serverId, next);
        if (!result.ok) {
          setError(result.error ?? "Could not save maintenance policy");
          return false;
        }
        setPolicy(result.data);
        return true;
      } finally {
        if (withBusy) setBusy(false);
      }
    },
    [serverId],
  );

  const patch = useCallback(
    async (partial: Partial<PolicyWrite>) => {
      if (policy === null) return false;
      const next = { ...maintenancePolicyWriteFromStatus(policy), ...partial };
      setPolicy((prev) => (prev === null ? prev : { ...prev, ...partial }));
      const ok = await save(next, { withBusy: false });
      if (!ok) {
        await load();
      }
      return ok;
    },
    [policy, save, load],
  );

  const resumeSchedules = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await window.api.clearMaintenanceSchedulePause(serverId);
      if (!result.ok) {
        setError(result.error ?? "Could not resume schedules");
        return;
      }
      setPolicy(result.data);
    } finally {
      setBusy(false);
    }
  }, [serverId]);

  const cancelUpcoming = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await window.api.cancelMaintenanceUpcoming(serverId);
      if (!result.ok) {
        setError(result.error ?? "Could not cancel countdown");
        return;
      }
      setPolicy(result.data);
    } finally {
      setBusy(false);
    }
  }, [serverId]);

  const runRestartNow = useCallback(() => {
    modals.openConfirmModal({
      title: "Run scheduled restart now?",
      centered: true,
      children:
        "Players get a short final warning, then a graceful restart with backup. Continue?",
      labels: { confirm: "Yes, restart", cancel: "Back" },
      confirmProps: { color: "blue" },
      onConfirm: () => {
        void (async () => {
          setBusy(true);
          setError(null);
          try {
            const result = await window.api.runMaintenanceRestartNow(serverId);
            if (!result.ok) {
              setError(result.error ?? "Could not start restart now");
              return;
            }
            setPolicy(result.data);
          } finally {
            setBusy(false);
          }
        })();
      },
    });
  }, [serverId]);

  const runUpdateNow = useCallback(() => {
    modals.openConfirmModal({
      title: "Run update now?",
      centered: true,
      children:
        "Players get a short final warning, then a safe update with backup. The server restarts if it was running. Continue?",
      labels: { confirm: "Yes, update", cancel: "Back" },
      confirmProps: { color: "blue" },
      onConfirm: () => {
        void (async () => {
          setBusy(true);
          setError(null);
          try {
            const result = await window.api.runMaintenanceUpdateNow(serverId);
            if (!result.ok) {
              setError(result.error ?? "Could not start update now");
              return;
            }
            setPolicy(result.data);
          } finally {
            setBusy(false);
          }
        })();
      },
    });
  }, [serverId]);

  return {
    policy,
    busy,
    error,
    restartOpen,
    updateOpen,
    setRestartOpen,
    setUpdateOpen,
    patch,
    resumeSchedules,
    cancelUpcoming,
    runRestartNow,
    runUpdateNow,
    reload: load,
  };
}
