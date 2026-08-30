import { useCallback, useEffect, useState } from "react";
import type { MaintenancePolicy, MaintenancePolicyStatus } from "@shared/types";
import { defaultMaintenancePolicy } from "@shared/maintenance-policy";

type PolicyWrite = Omit<MaintenancePolicy, "serverId" | "updatedAt">;

export function useMaintenancePanel(serverId: string) {
  const [policy, setPolicy] = useState<MaintenancePolicyStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restartOpen, setRestartOpen] = useState(false);
  const [wipeOpen, setWipeOpen] = useState(false);
  const [updateOpen, setUpdateOpen] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const result = await window.api.getMaintenancePolicy(serverId);
    if (!result.ok) {
      setError(result.error ?? "Could not load maintenance policy");
      setPolicy({
        ...defaultMaintenancePolicy(serverId, new Date().toISOString()),
        schedulePaused: false,
      });
      return;
    }
    setPolicy(result.data);
  }, [serverId]);

  useEffect(() => {
    void load();
  }, [load]);

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
        const status = await window.api.getMaintenancePolicy(serverId);
        if (status.ok) {
          setPolicy(status.data);
        } else {
          setPolicy({ ...result.data, schedulePaused: policy?.schedulePaused ?? false });
        }
        return true;
      } finally {
        setBusy(false);
      }
    },
    [serverId, policy?.schedulePaused],
  );

  const patch = useCallback(
    async (partial: Partial<PolicyWrite>) => {
      if (policy === null) return false;
      const {
        serverId: _s,
        updatedAt: _u,
        schedulePaused: _p,
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
    reload: load,
  };
}
