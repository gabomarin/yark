import { useEffect, useState } from "react";
import type { HostedResourceDto } from "@shared/ipc";
import type { HostedResourceLike } from "@shared/settings/hosted-resource-consumers";

interface HostedResourceOptions {
  resources: HostedResourceLike[];
  /** False when the loopback host is off; creating still works, nothing is served yet. */
  hostEnabled: boolean;
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

/**
 * Resource list for the setting selectors (#577). A failed load degrades to an empty list
 * on purpose: the field stays a plain URL input, which is always valid.
 */
export function useHostedResourceOptions(): HostedResourceOptions {
  const [resources, setResources] = useState<HostedResourceLike[]>([]);
  const [hostEnabled, setHostEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await window.api.getHostedResourcesOverview();
        if (cancelled || !result.ok) return;
        setResources(result.data.resources.map(toLike));
        setHostEnabled(result.data.state.enabled);
      } catch {
        // Selector degrades to a plain URL field.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { resources, hostEnabled };
}
