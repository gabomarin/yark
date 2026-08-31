import { useCallback, useEffect, useState } from "react";
import type { MaintenancePolicy, MaintenancePolicyStatus } from "@shared/types";
import { defaultMaintenancePolicy } from "@shared/maintenance-policy";
import { modals } from "@mantine/modals";

type PolicyWrite = Omit<MaintenancePolicy, "serverId" | "updatedAt">;

function idleStatus(serverId: string): MaintenancePolicyStatus {
  return {
    ...defaultMaintenancePolicy(serverId, new Date().toISOString()),
    schedulePaused: false,
    nextRestartAt: null,
    countdownRemainingMs: null,
    countdownPhase: "idle",
    lastRestartAt: null,
    lastRestartOk: null,
    lastWipeAt: null,
    lastWipeOk: null,
    cancelable: false,
  };
}

/** Live Up next: 1s in last minute / wipe; relaxed in warning; pause when tab hidden. */
function pollIntervalMs(phase: MaintenancePolicyStatus["countdownPhase"]): number {
  if (
    phase === "last_minute"
    || phase === "restarting"
    || phase === "wiping"
  ) {
    return 1_000;
  }
  // Warning windows span minutes; avoid fleet-wide 1–3s IPC chatter.
  return 15_000;
}

export function useMaintenancePanel(serverId: string) {
  const [policy, setPolicy] = useState<MaintenancePolicyStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restartOpen, setRestartOpen] = useState(false);
  const [wipeOpen, setWipeOpen] = useState(false);
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

  const phase = policy?.countdownPhase ?? "idle";
  useEffect(() => {
    if (phase === "idle") return undefined;

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
    async (next: PolicyWrite) => {
      setBusy(true);
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
        setBusy(false);
      }
    },
    [serverId],
  );

  const patch = useCallback(
    async (partial: Partial<PolicyWrite>) => {
      if (policy === null) return false;
      const {
        serverId: _s,
        updatedAt: _u,
        schedulePaused: _p,
        nextRestartAt: _n,
        countdownRemainingMs: _c,
        countdownPhase: _ph,
        lastRestartAt: _l,
        lastRestartOk: _ok,
        lastWipeAt: _lw,
        lastWipeOk: _lwo,
        cancelable: _ca,
        ...rest
      } = policy;
      return save({ ...rest, ...partial });
    },
    [policy, save],
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
      title: "Run restart now?",
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

  return {
    policy,
    busy,
    error,
    restartOpen,
    wipeOpen,
    updateOpen,
    setRestartOpen,
    setWipeOpen,
    setUpdateOpen,
    patch,
    resumeSchedules,
    cancelUpcoming,
    runRestartNow,
    reload: load,
  };
}
