/**
 * Hosted Resources (#577): which settings accept a resource URL, and what kind/format
 * they are compatible with. Slice 1 wires `AdminListURL`, `BanListURL` and
 * `CustomDynamicConfigUrl` to the resource selector.
 *
 * The catalog is the single source of truth for compatibility. Selectors filter by
 * `kind` (never by operator tags), and the create helper pre-fills kind + format from here.
 */

import { formatForHostedResourceKind, type HostedResourceFormat, type HostedResourceKind } from "./hosted-resources";

/** Where a URL-consuming setting is edited. Keeps docs and surface wiring aligned. */
type HostedResourceConsumerSurface = "rcon-admins" | "ini-visual" | "launch-option";

export interface HostedResourceConsumer {
  /** Canonical setting name as the operator sees it in the UI. */
  setting: string;
  /** Launch-option catalog id when the setting lives on the Launch tab. */
  launchOptionId: string | null;
  kind: HostedResourceKind;
  /** Format the kind implies; used to pre-fill the create flow. */
  format: HostedResourceFormat;
  label: string;
  surface: HostedResourceConsumerSurface;
  /** Parent flag the row depends on; the setting is inert until it is on. */
  dependsOnLaunchOptionId?: string;
}

export const ADMIN_LIST_URL_CONSUMER: HostedResourceConsumer = {
  setting: "AdminListURL",
  launchOptionId: null,
  kind: "admin-list",
  format: formatForHostedResourceKind("admin-list"),
  label: "Admin list",
  surface: "rcon-admins",
};

export const BAN_LIST_URL_CONSUMER: HostedResourceConsumer = {
  setting: "BanListURL",
  launchOptionId: null,
  kind: "ban-list",
  format: formatForHostedResourceKind("ban-list"),
  label: "Ban list",
  surface: "ini-visual",
};

export const CUSTOM_DYNAMIC_CONFIG_URL_CONSUMER: HostedResourceConsumer = {
  setting: "CustomDynamicConfigUrl",
  launchOptionId: "customdynamicconfigurl-url",
  kind: "dynamic-config",
  format: formatForHostedResourceKind("dynamic-config"),
  label: "Dynamic config",
  surface: "launch-option",
  dependsOnLaunchOptionId: "usedynamicconfig",
};

export const HOSTED_RESOURCE_CONSUMERS: readonly HostedResourceConsumer[] = [
  ADMIN_LIST_URL_CONSUMER,
  BAN_LIST_URL_CONSUMER,
  CUSTOM_DYNAMIC_CONFIG_URL_CONSUMER,
];

export function consumerForSetting(setting: string): HostedResourceConsumer | null {
  const wanted = setting.trim().toLowerCase();
  return HOSTED_RESOURCE_CONSUMERS.find((consumer) => consumer.setting.toLowerCase() === wanted) ?? null;
}

export function consumerForLaunchOptionId(optionId: string): HostedResourceConsumer | null {
  return HOSTED_RESOURCE_CONSUMERS.find((consumer) => consumer.launchOptionId === optionId) ?? null;
}

/** The minimal resource shape compatibility needs (avoids a shared→ipc import cycle). */
export interface HostedResourceLike {
  id: string;
  displayName: string;
  url: string;
  enabled: boolean;
  kind: HostedResourceKind | null;
  publishedRevisionId: string | null;
}

/** Offerable for a consumer: typed for it, enabled, and serving a published revision. */
export function isHostedResourceCompatible(resource: HostedResourceLike, consumer: HostedResourceConsumer): boolean {
  return resource.enabled && resource.publishedRevisionId !== null && resource.kind === consumer.kind;
}
