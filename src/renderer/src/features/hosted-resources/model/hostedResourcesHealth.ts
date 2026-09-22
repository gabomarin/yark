import type { HostedResourceReferenceDto, HostedResourcesDiagnosticsDto } from "@shared/ipc";

export type HostedResourcesHealth = "neutral" | "healthy" | "warning" | "error";

export interface HostedResourcesHealthSummary {
  state: HostedResourcesHealth;
  label: string;
  description: string;
  referencesByServerId: Map<string, HostedResourceReferenceDto[]>;
}

export function summarizeHostedResourcesHealth(
  diagnostics: HostedResourcesDiagnosticsDto | null,
): HostedResourcesHealthSummary {
  if (diagnostics === null) {
    return {
      state: "neutral",
      label: "No health check",
      description: "Hosted Resources health has not been checked yet.",
      referencesByServerId: new Map(),
    };
  }

  const referencesByServerId = new Map<string, HostedResourceReferenceDto[]>();
  for (const reference of diagnostics.references) {
    const references = referencesByServerId.get(reference.serverId) ?? [];
    references.push(reference);
    referencesByServerId.set(reference.serverId, references);
  }

  if (!diagnostics.state.enabled) {
    if (diagnostics.references.length > 0) {
      return {
        state: "error",
        label: "Hosted Resources unavailable",
        description: "Hosted Resources is off, but server settings still reference hosted URLs.",
        referencesByServerId,
      };
    }
    return {
      state: "neutral",
      label: "Hosted Resources off",
      description: "Hosted Resources is disabled.",
      referencesByServerId,
    };
  }

  if (!diagnostics.ownership.ok) {
    return {
      state: "error",
      label: "Hosted Resources unavailable",
      description: "YARK cannot serve hosted resources from the configured port.",
      referencesByServerId,
    };
  }

  if (diagnostics.resources.length === 0 && diagnostics.references.length === 0) {
    return {
      state: "neutral",
      label: "No resources published",
      description: "Publish a resource to start serving hosted content.",
      referencesByServerId,
    };
  }

  const hasWarning =
    diagnostics.resources.some((resource) => resource.status !== "verified") ||
    diagnostics.references.some((reference) => reference.status !== "current");
  if (hasWarning) {
    return {
      state: "warning",
      label: "Hosted Resources need attention",
      description: "Some hosted resource content or server settings need attention.",
      referencesByServerId,
    };
  }

  return {
    state: "healthy",
    label: "Hosted Resources healthy",
    description: "Hosted Resources is serving verified content.",
    referencesByServerId,
  };
}
