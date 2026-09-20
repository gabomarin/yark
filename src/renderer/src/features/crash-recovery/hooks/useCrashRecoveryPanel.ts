import { useCallback, useEffect, useState } from "react";
import type { CrashRecoveryPolicy } from "@shared/types";
import { defaultCrashRecoveryPolicy } from "@shared/crash-recovery/crash-recovery-policy";

type PolicyWrite = Omit<CrashRecoveryPolicy, "serverId" | "updatedAt" | "attempts" | "exhausted" | "lastFailureReason">;

/** Live poll while the Maintenance tab is open (crashes arrive out-of-band). */
const CRASH_RECOVERY_POLL_MS = 5_000;

export function useCrashRecoveryPanel(serverId: string) {
  const [policy, setPolicy] = useState<CrashRecoveryPolicy | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await window.api.getCrashRecoveryPolicy(serverId);
    if (!result.ok) {
      setError(result.error ?? "Could not load crash recovery policy");
      setPolicy(defaultCrashRecoveryPolicy(serverId, new Date().toISOString()));
      return;
    }
    setError(null);
    setPolicy(result.data);
  }, [serverId]);

  useEffect(() => {
    void load();
  }, [load]);

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
      id = window.setInterval(() => void load(), CRASH_RECOVERY_POLL_MS);
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
  }, [load]);

  const save = useCallback(
    async (next: PolicyWrite, withBusy = true) => {
      if (withBusy) setBusy(true);
      setError(null);
      try {
        const result = await window.api.setCrashRecoveryPolicy(serverId, next);
        if (!result.ok) {
          setError(result.error ?? "Could not save crash recovery policy");
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
      const next: PolicyWrite = {
        enabled: partial.enabled ?? policy.enabled,
        maxAttempts: partial.maxAttempts ?? policy.maxAttempts,
        backoffSeconds: partial.backoffSeconds ?? policy.backoffSeconds,
        stabilitySeconds: partial.stabilitySeconds ?? policy.stabilitySeconds,
        paused: partial.paused ?? policy.paused,
      };
      setPolicy((prev) => (prev === null ? prev : { ...prev, ...partial }));
      const ok = await save(next, false);
      if (!ok) await load();
      return ok;
    },
    [policy, save, load],
  );

  const resetAttempts = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await window.api.resetCrashRecoveryAttempts(serverId);
      if (!result.ok) {
        setError(result.error ?? "Could not reset crash recovery attempts");
        return;
      }
      setPolicy(result.data);
    } finally {
      setBusy(false);
    }
  }, [serverId]);

  return { policy, busy, error, patch, resetAttempts, reload: load };
}
