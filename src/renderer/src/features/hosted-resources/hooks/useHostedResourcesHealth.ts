import { useEffect, useState } from "react";
import type { HostedResourcesDiagnosticsDto } from "@shared/ipc";
import { summarizeHostedResourcesHealth, type HostedResourcesHealthSummary } from "../model/hostedResourcesHealth";

const HOSTED_RESOURCES_DIAGNOSTICS_UPDATED_EVENT = "yark:hosted-resources-diagnostics-updated";
export const HOSTED_RESOURCES_DIAGNOSTICS_LOADED_EVENT = "yark:hosted-resources-diagnostics-loaded";

let cachedDiagnostics: HostedResourcesDiagnosticsDto | null = null;

export function getCachedHostedResourcesDiagnostics(): HostedResourcesDiagnosticsDto | null {
  return cachedDiagnostics;
}

/** Drop the module snapshot so renderer suites do not inherit another test's diagnostics. */
export function resetHostedResourcesDiagnosticsSnapshot(): void {
  cachedDiagnostics = null;
}

/** Publish a fresh snapshot to the shared cache; every consumer renders from it. */
export function setCachedHostedResourcesDiagnostics(diagnostics: HostedResourcesDiagnosticsDto): void {
  cachedDiagnostics = diagnostics;
  window.dispatchEvent(new Event(HOSTED_RESOURCES_DIAGNOSTICS_LOADED_EVENT));
}

export function notifyHostedResourcesDiagnosticsUpdated(): void {
  window.dispatchEvent(new Event(HOSTED_RESOURCES_DIAGNOSTICS_UPDATED_EVENT));
}

export function useHostedResourcesHealth(): HostedResourcesHealthSummary {
  const [diagnostics, setDiagnostics] = useState<HostedResourcesDiagnosticsDto | null>(cachedDiagnostics);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const result = await window.api.getHostedResourcesDiagnostics();
        if (active && result?.ok === true) {
          setCachedHostedResourcesDiagnostics(result.data);
          setDiagnostics(result.data);
        }
      } catch {
        // The sidebar stays neutral when diagnostics are not available yet.
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

  return summarizeHostedResourcesHealth(diagnostics);
}
