import { useEffect, useMemo, useState } from "react";
import type { HostedResourcesDiagnosticsDto } from "@shared/ipc";
import { summarizeHostedResourcesHealth, type HostedResourcesHealthSummary } from "../model/hostedResourcesHealth";

const HOSTED_RESOURCES_DIAGNOSTICS_UPDATED_EVENT = "yark:hosted-resources-diagnostics-updated";
export const HOSTED_RESOURCES_DIAGNOSTICS_LOADED_EVENT = "yark:hosted-resources-diagnostics-loaded";

let cachedDiagnostics: HostedResourcesDiagnosticsDto | null = null;
let inflightDiagnostics: Promise<HostedResourcesDiagnosticsDto | null> | null = null;

export function getCachedHostedResourcesDiagnostics(): HostedResourcesDiagnosticsDto | null {
  return cachedDiagnostics;
}

/** Drop the module snapshot so renderer suites do not inherit another test's diagnostics. */
export function resetHostedResourcesDiagnosticsSnapshot(): void {
  cachedDiagnostics = null;
  inflightDiagnostics = null;
}

/** Publish a fresh snapshot to the shared cache; every consumer renders from it. */
export function setCachedHostedResourcesDiagnostics(diagnostics: HostedResourcesDiagnosticsDto): void {
  cachedDiagnostics = diagnostics;
  window.dispatchEvent(new Event(HOSTED_RESOURCES_DIAGNOSTICS_LOADED_EVENT));
}

export function notifyHostedResourcesDiagnosticsUpdated(): void {
  window.dispatchEvent(new Event(HOSTED_RESOURCES_DIAGNOSTICS_UPDATED_EVENT));
}

/**
 * One probe at a time: concurrent triggers (mount + event fan-out) share the same request,
 * so a slower stale response cannot land after a newer one and overwrite the cache.
 */
async function fetchHostedResourcesDiagnostics(): Promise<HostedResourcesDiagnosticsDto | null> {
  if (inflightDiagnostics !== null) return inflightDiagnostics;
  inflightDiagnostics = (async () => {
    try {
      const result = await window.api.getHostedResourcesDiagnostics();
      return result?.ok === true ? result.data : null;
    } catch {
      // The sidebar stays neutral when diagnostics are not available yet.
      return null;
    } finally {
      inflightDiagnostics = null;
    }
  })();
  return inflightDiagnostics;
}

export function useHostedResourcesHealth(): HostedResourcesHealthSummary {
  const [diagnostics, setDiagnostics] = useState<HostedResourcesDiagnosticsDto | null>(cachedDiagnostics);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const data = await fetchHostedResourcesDiagnostics();
      if (active && data !== null) {
        setCachedHostedResourcesDiagnostics(data);
        setDiagnostics(data);
      }
    };
    // Render from the cache another consumer just published; never refetch on this event.
    const syncFromCache = () => {
      if (active && cachedDiagnostics !== null) setDiagnostics(cachedDiagnostics);
    };

    // The cache is only an initial-render hint: always revalidate on mount so a failed
    // earlier load cannot pin a stale snapshot for a consumer mounted afterwards.
    void load();
    window.addEventListener(HOSTED_RESOURCES_DIAGNOSTICS_LOADED_EVENT, syncFromCache);
    window.addEventListener(HOSTED_RESOURCES_DIAGNOSTICS_UPDATED_EVENT, load);
    return () => {
      active = false;
      window.removeEventListener(HOSTED_RESOURCES_DIAGNOSTICS_LOADED_EVENT, syncFromCache);
      window.removeEventListener(HOSTED_RESOURCES_DIAGNOSTICS_UPDATED_EVENT, load);
    };
  }, []);

  // The summary builds fresh Maps/arrays; memoizing it keeps downstream prop identities
  // stable across the AppShell's frequent re-renders while the snapshot is unchanged.
  return useMemo(() => summarizeHostedResourcesHealth(diagnostics), [diagnostics]);
}
