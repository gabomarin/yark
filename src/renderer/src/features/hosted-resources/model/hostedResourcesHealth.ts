import type { HostedResourceReferenceDto, HostedResourcesDiagnosticsDto } from "@shared/ipc";

export type HostedResourcesHealth = "neutral" | "healthy" | "warning" | "error";

export interface HostedResourcesHealthSummary {
  state: HostedResourcesHealth;
  referencesByServerId: Map<string, HostedResourceReferenceDto[]>;
}

/**
 * Drift or stale references worth an operator's attention. `disabled` / `unpublished`
 * are deliberate states (gray on the card), not something to nag about.
 */
export function hasDiagnosticWarning(diagnostics: HostedResourcesDiagnosticsDto): boolean {
  return (
    diagnostics.resources.some((resource) => resource.status === "mismatch" || resource.status === "unreachable") ||
    diagnostics.references.some((reference) => reference.status !== "current")
  );
}

export function summarizeHostedResourcesHealth(
  diagnostics: HostedResourcesDiagnosticsDto | null,
): HostedResourcesHealthSummary {
  if (diagnostics === null) {
    return { state: "neutral", referencesByServerId: new Map() };
  }

  const referencesByServerId = new Map<string, HostedResourceReferenceDto[]>();
  for (const reference of diagnostics.references) {
    const references = referencesByServerId.get(reference.serverId) ?? [];
    references.push(reference);
    referencesByServerId.set(reference.serverId, references);
  }

  if (!diagnostics.state.enabled) {
    return {
      state: diagnostics.references.length > 0 ? "error" : "neutral",
      referencesByServerId,
    };
  }

  if (!diagnostics.ownership.ok) {
    return { state: "error", referencesByServerId };
  }

  if (diagnostics.resources.length === 0 && diagnostics.references.length === 0) {
    return { state: "neutral", referencesByServerId };
  }

  return { state: hasDiagnosticWarning(diagnostics) ? "warning" : "healthy", referencesByServerId };
}
