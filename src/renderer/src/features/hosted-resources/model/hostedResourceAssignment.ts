/**
 * Hosted Resources (#577): classify the value an input holds against the resource
 * catalog, so a selector can warn without ever rewriting the operator's URL.
 *
 * The value is matched on the resource **token**, not on the whole URL: that is what lets
 * a stale-port value be recognised as "this resource, wrong port" instead of "unknown".
 * Anything that is not a loopback resource URL (an external Gist, a blank field) is left
 * alone.
 */

import { HOSTED_RESOURCE_KIND_LABELS, parseHostedResourceUrl } from "@shared/settings/hosted-resources";
import {
  isHostedResourceCompatible,
  type HostedResourceConsumer,
  type HostedResourceLike,
} from "@shared/settings/hosted-resource-consumers";

type HostedResourceAssignmentIssue =
  "disabled" | "unpublished" | "stale-port" | "incompatible-kind" | "untyped" | "missing";

export interface HostedResourceAssignment {
  /** The YARK resource the value points at, when a token matches one. */
  resource: HostedResourceLike | null;
  /** Null when the value is fine: empty, external, or a compatible resource. */
  issue: HostedResourceAssignmentIssue | null;
}

/** http default, so a portless loopback URL still compares to the served port. */
function portOf(url: string): number | null {
  const parsed = parseHostedResourceUrl(url);
  return parsed === null ? null : (parsed.port ?? 80);
}

function tokenOf(url: string): string | null {
  return parseHostedResourceUrl(url)?.token ?? null;
}

/** Resources the selector may offer for a consumer: typed for it, enabled, and serving. */
export function compatibleResources(
  resources: readonly HostedResourceLike[],
  consumer: HostedResourceConsumer,
): HostedResourceLike[] {
  return resources.filter((resource) => isHostedResourceCompatible(resource, consumer));
}

export function classifyHostedResourceValue(
  value: string,
  resources: readonly HostedResourceLike[],
  consumer: HostedResourceConsumer,
): HostedResourceAssignment {
  const token = tokenOf(value);
  if (token === null) {
    return { resource: null, issue: null };
  }
  const resource = resources.find((entry) => tokenOf(entry.url) === token) ?? null;
  if (resource === null) return { resource: null, issue: "missing" };
  if (!resource.enabled) return { resource, issue: "disabled" };
  if (resource.publishedRevisionId === null) return { resource, issue: "unpublished" };
  // The resource's URL carries the port the host serves on now: a value on another port
  // is a stale reference ASA cannot fetch, even though the resource itself is healthy.
  if (portOf(value) !== portOf(resource.url)) return { resource, issue: "stale-port" };
  if (resource.kind === null) return { resource, issue: "untyped" };
  if (resource.kind !== consumer.kind) return { resource, issue: "incompatible-kind" };
  return { resource, issue: null };
}

/**
 * One line of operator copy per issue. `untyped` and `incompatible-kind` are not errors —
 * the URL still serves — so the wording has to say what changed and what stopped.
 */
export function assignmentIssueMessage(
  assignment: HostedResourceAssignment,
  consumer: HostedResourceConsumer,
): string | null {
  const { issue, resource } = assignment;
  if (issue === null) return null;
  const name = resource === null ? null : `"${resource.displayName}"`;
  switch (issue) {
    case "disabled":
      return `${name} is disabled, so ASA cannot fetch this URL. Re-enable it in Hosted Resources.`;
    case "unpublished":
      return `${name} has no published content yet, so this URL serves nothing.`;
    case "stale-port":
      return `${name} is now served on port ${portOf(resource!.url)}, but this URL points at another port, so ASA cannot fetch it. Pick the resource again to use the current address.`;
    case "untyped":
      return `${name} has no resource type. It still serves, but it is not offered for ${consumer.label} fields until you set one.`;
    case "incompatible-kind":
      return `${name} is typed as ${HOSTED_RESOURCE_KIND_LABELS[resource!.kind!]}, not ${consumer.label}. It still serves, but it is not offered here.`;
    case "missing":
      return "This looks like a YARK Hosted Resource URL, but no current resource serves it. It may have been deleted.";
  }
}
