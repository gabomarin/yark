import type { AppEvent } from "../types";

export const DISCORD_WEBHOOK_SETTING_KEY = "discord.webhook.v1";

export type DiscordWebhookEvent =
  | "serverStarted"
  | "serverStopped"
  | "serverClosedByUser"
  | "serverCrashed"
  | "updateStarted"
  | "updateCompleted"
  | "updateFailed";

export interface DiscordWebhookPreferences {
  enabled: boolean;
  webhookUrl: string;
  events: Record<DiscordWebhookEvent, boolean>;
  /**
   * Optional per-event custom message templates. Empty/absent values keep the
   * built-in copy. Templates interpolate `{server}` and `{detail}` tokens.
   */
  customMessages: Partial<Record<DiscordWebhookEvent, string>>;
}

export const DEFAULT_DISCORD_WEBHOOK_PREFERENCES: DiscordWebhookPreferences = {
  enabled: false,
  webhookUrl: "",
  events: {
    serverStarted: true,
    serverStopped: true,
    serverClosedByUser: false,
    serverCrashed: true,
    updateStarted: true,
    updateCompleted: true,
    updateFailed: true,
  },
  customMessages: {},
};

/** Upper bound shared by the built-in `safeText` and custom templates. */
export const DISCORD_MESSAGE_MAX_LENGTH = 500;

/** Placeholders a custom message template may use. */
const DISCORD_MESSAGE_PLACEHOLDERS = ["server", "detail"] as const;

export interface DiscordMessageContext {
  /** Server/profile display name (or `Server` for fleet-wide update jobs). */
  server: string;
  /** Free-form job detail for SteamCMD events; absent on lifecycle events. */
  detail?: string;
}

function safeText(value: string, max = DISCORD_MESSAGE_MAX_LENGTH): string {
  const trimmed = value.trim().replace(/@(?!\u200b)/g, "@\u200b");
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`;
}

/**
 * Trim a custom template, neutralize mentions, drop unknown `{tokens}`, and
 * cap its length. Returns "" when the template would render nothing.
 */
export function sanitizeDiscordMessageTemplate(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) return "";
  const withoutMentions = trimmed.replace(
    /@(?!\u200b)/g,
    "@\u200b",
  );
  const withoutUnknown = withoutMentions.replace(/\{([^{}]+)\}/g, (token, name) =>
    (DISCORD_MESSAGE_PLACEHOLDERS as readonly string[]).includes(name) ? token : "",
  );
  return safeText(withoutUnknown);
}

/** Interpolate the whitelisted tokens of a sanitized template. */
export function renderDiscordMessage(
  template: string,
  context: DiscordMessageContext,
): string {
  let rendered = sanitizeDiscordMessageTemplate(template);
  for (const placeholder of DISCORD_MESSAGE_PLACEHOLDERS) {
    const value = placeholder === "detail" ? (context.detail ?? "") : context.server;
    if (value.trim().length === 0 && placeholder === "detail") {
      rendered = rendered.replace(new RegExp(`\\s*\\{${placeholder}\\}\\s*`, "g"), " ");
      continue;
    }
    rendered = rendered.replaceAll(`{${placeholder}}`, safeText(value));
  }
  return rendered.replace(/[ \t]{2,}/g, " ").trim();
}

export interface DiscordUpdateEventPayload {
  type: Extract<
    AppEvent["type"],
    "update_started" | "update_completed" | "update_failed" | "update_rolled_back"
  >;
  severity: AppEvent["severity"];
  serverId: string | null;
  serverName: string | null;
  jobId: string | null;
  eventId: number;
  message: string;
}

export interface DiscordClosedByUserPayload {
  serverId: string;
  serverName: string;
  eventId: number;
}

export function parseDiscordWebhookPreferences(
  raw: string | null,
): DiscordWebhookPreferences {
  if (raw === null) return structuredClone(DEFAULT_DISCORD_WEBHOOK_PREFERENCES);
  try {
    const value = JSON.parse(raw) as Partial<DiscordWebhookPreferences>;
    const events: Partial<Record<DiscordWebhookEvent, boolean>> = value.events ?? {};
    const rawMessages: Partial<Record<DiscordWebhookEvent, unknown>> =
      value.customMessages ?? {};
    const customMessages: Partial<Record<DiscordWebhookEvent, string>> = {};
    const EVENT_KEYS = [
      "serverStarted",
      "serverStopped",
      "serverClosedByUser",
      "serverCrashed",
      "updateStarted",
      "updateCompleted",
      "updateFailed",
    ] as const satisfies readonly DiscordWebhookEvent[];
    for (const event of EVENT_KEYS) {
      if (typeof rawMessages[event] === "string") {
        const sanitized = sanitizeDiscordMessageTemplate(rawMessages[event] as string);
        if (sanitized.length > 0) customMessages[event] = sanitized;
      }
    }
    return {
      enabled: value.enabled === true,
      webhookUrl: typeof value.webhookUrl === "string" ? value.webhookUrl.trim() : "",
      events: {
        serverStarted: events.serverStarted !== false,
        serverStopped: events.serverStopped !== false,
        serverClosedByUser: events.serverClosedByUser === true,
        serverCrashed: events.serverCrashed !== false,
        updateStarted: events.updateStarted !== false,
        updateCompleted: events.updateCompleted !== false,
        updateFailed: events.updateFailed !== false,
      },
      customMessages,
    };
  } catch {
    return structuredClone(DEFAULT_DISCORD_WEBHOOK_PREFERENCES);
  }
}

export function serializeDiscordWebhookPreferences(
  preferences: DiscordWebhookPreferences,
): string {
  return JSON.stringify({
    ...preferences,
    webhookUrl: preferences.webhookUrl.trim(),
  });
}

/** Accept only Discord's HTTPS webhook endpoint; the path contains the secret token. */
export function isDiscordWebhookUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return (
      url.protocol === "https:"
      && url.hostname === "discord.com"
      && url.username === ""
      && url.password === ""
      && url.hash === ""
      && /^\/api\/webhooks\/\d+\/[^/]+\/?$/.test(url.pathname)
    );
  } catch {
    return false;
  }
}
