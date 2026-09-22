/**
 * Hosted Resources (#577): which settings accept a resource URL, and what kind/format
 * they are compatible with. Every ASA URL consumer YARK knows — `AdminListURL`,
 * `BanListURL`, `BadWordListURL`, `BadWordWhiteListURL`, `CustomLiveTuningUrl`,
 * `CustomDynamicConfigUrl` and `CustomNotificationURL` — is wired to the selector.
 *
 * The catalog is the single source of truth for compatibility. Selectors filter by
 * `kind` (never by operator tags), and the create helper pre-fills kind + format from here.
 */

import { formatForHostedResourceKind, type HostedResourceFormat, type HostedResourceKind } from "./hosted-resources";

/** Where a URL-consuming setting is edited. Keeps docs and surface wiring aligned. */
export type HostedResourceConsumerSurface = "rcon-admins" | "ini-visual" | "launch-option";

/**
 * Operator-facing location per surface. Reference copy and the jump target both derive
 * from the consumer's surface, so a setting is never linked to a tab it cannot be edited in.
 */
export const HOSTED_RESOURCE_SURFACE_LABELS: Record<HostedResourceConsumerSurface, string> = {
  "rcon-admins": "RCON → Admins",
  "ini-visual": "INI Files → Visual",
  "launch-option": "Launch",
};

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

export const BAD_WORD_LIST_URL_CONSUMER: HostedResourceConsumer = {
  setting: "BadWordListURL",
  launchOptionId: null,
  kind: "bad-word-list",
  format: formatForHostedResourceKind("bad-word-list"),
  label: "Bad words list",
  surface: "ini-visual",
};

export const BAD_WORD_WHITE_LIST_URL_CONSUMER: HostedResourceConsumer = {
  setting: "BadWordWhiteListURL",
  launchOptionId: null,
  kind: "good-word-list",
  format: formatForHostedResourceKind("good-word-list"),
  label: "Good words list",
  surface: "ini-visual",
};

export const CUSTOM_LIVE_TUNING_URL_CONSUMER: HostedResourceConsumer = {
  setting: "CustomLiveTuningUrl",
  launchOptionId: null,
  kind: "live-tuning",
  format: formatForHostedResourceKind("live-tuning"),
  label: "Live tuning",
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

export const CUSTOM_NOTIFICATION_URL_CONSUMER: HostedResourceConsumer = {
  setting: "CustomNotificationURL",
  launchOptionId: "customnotificationurl-url",
  kind: "notification-url",
  format: formatForHostedResourceKind("notification-url"),
  label: "Notification URL",
  surface: "launch-option",
};

export const HOSTED_RESOURCE_CONSUMERS: readonly HostedResourceConsumer[] = [
  ADMIN_LIST_URL_CONSUMER,
  BAN_LIST_URL_CONSUMER,
  BAD_WORD_LIST_URL_CONSUMER,
  BAD_WORD_WHITE_LIST_URL_CONSUMER,
  CUSTOM_LIVE_TUNING_URL_CONSUMER,
  CUSTOM_DYNAMIC_CONFIG_URL_CONSUMER,
  CUSTOM_NOTIFICATION_URL_CONSUMER,
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
