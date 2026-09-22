import { useEffect, useState } from "react";
import type { HostedResourceDto } from "@shared/ipc";
import type { HostedResourceLike } from "@shared/settings/hosted-resource-consumers";

interface HostedResourceOptions {
  resources: HostedResourceLike[];
  /** False when the loopback host is off; creating still works, nothing is served yet. */
  hostEnabled: boolean;
  /** False until the first overview response lands, so callers can hold back "missing". */
  loaded: boolean;
  /** Refetch after a resource is created while a selector is mounted. */
  reload: () => Promise<void>;
}

interface HostedResourceOptionsSnapshot {
  resources: HostedResourceLike[];
  hostEnabled: boolean;
  loaded: boolean;
}

const EMPTY_SNAPSHOT: HostedResourceOptionsSnapshot = { resources: [], hostEnabled: false, loaded: false };

/**
 * One overview per app, shared by every mounted selector: opening the Visual INI tab or a
 * launch-option row would otherwise fire the same local IPC read once per field.
 */
let snapshot: HostedResourceOptionsSnapshot = EMPTY_SNAPSHOT;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

/** Drop the module snapshot so renderer suites do not inherit another test's options. */
export function resetHostedResourceOptionsSnapshot(): void {
  snapshot = EMPTY_SNAPSHOT;
  inflight = null;
}

function toLike(resource: HostedResourceDto): HostedResourceLike {
  return {
    id: resource.id,
    displayName: resource.displayName,
    url: resource.url,
    enabled: resource.enabled,
    kind: resource.kind,
    publishedRevisionId: resource.publishedRevisionId,
  };
}

/** Refetch the catalog once, no matter how many selectors ask at the same time. */
async function loadHostedResourceOptions(): Promise<void> {
  if (inflight !== null) return inflight;
  inflight = (async () => {
    try {
      const result = await window.api.getHostedResourcesOverview();
      if (result.ok) {
        snapshot = {
          resources: result.data.resources.map(toLike),
          hostEnabled: result.data.state.enabled,
          loaded: true,
        };
        for (const listener of listeners) listener();
      }
    } catch {
      // Selector degrades to a plain URL field.
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/**
 * Resource list for the setting selectors (#577). A failed load degrades to an empty list
 * on purpose: the field stays a plain URL input, which is always valid.
 */
export function useHostedResourceOptions(): HostedResourceOptions {
  const [value, setValue] = useState<HostedResourceOptionsSnapshot>(snapshot);

  useEffect(() => {
    const listener = () => setValue(snapshot);
    listeners.add(listener);
    // Revalidate on mount so a selector opened later never shows a stale list. Only a
    // successful load notifies, so a failure cannot re-render every selector for nothing.
    void loadHostedResourceOptions();
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return {
    resources: value.resources,
    hostEnabled: value.hostEnabled,
    loaded: value.loaded,
    reload: loadHostedResourceOptions,
  };
}
