import type { AppSettingsRepository } from "../backend/infra/db/app-settings-repository";
import {
  shouldNotifySteamCmdJobEvent,
  type ServerCrashedNotifyPayload,
} from "../shared/settings/os-notification-events";
import {
  DISCORD_WEBHOOK_SETTING_KEY,
  isDiscordWebhookUrl,
  parseDiscordWebhookPreferences,
  renderDiscordMessage,
  type DiscordMessageContext,
  type DiscordUpdateEventPayload,
  type DiscordClosedByUserPayload,
  type DiscordWebhookEvent,
  type DiscordWebhookPreferences,
} from "../shared/settings/discord-webhook";

const DISCORD_COOLDOWN_MS = 120_000;
const DISCORD_TIMEOUT_MS = 10_000;

interface DiscordLifecyclePayload {
  serverId: string;
  serverName: string;
  status: "started" | "stopped";
}

type FetchLike = typeof fetch;

function safeText(value: string, max = 500): string {
  const trimmed = value.trim().replaceAll("@", "@\u200b");
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`;
}

export class DiscordWebhookService {
  private readonly lastSentAt = new Map<string, number>();
  private deliveryChain: Promise<void> = Promise.resolve();

  constructor(
    private readonly settings: AppSettingsRepository,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  getPreferences(): DiscordWebhookPreferences {
    return parseDiscordWebhookPreferences(
      this.settings.get(DISCORD_WEBHOOK_SETTING_KEY),
    );
  }

  async test(webhookUrl: string, description?: string): Promise<void> {
    await this.deliver(webhookUrl, {
      title: "YARK connection test",
      description: description ?? "Discord notifications are configured correctly.",
      color: 0x5865f2,
    });
  }

  notifyLifecycle(payload: DiscordLifecyclePayload): void {
    const event: DiscordWebhookEvent =
      payload.status === "started" ? "serverStarted" : "serverStopped";
    this.enqueue(
      event,
      payload.serverId,
      {
        title: payload.status === "started" ? "Server ready" : "Server stopped",
        description: `**${safeText(payload.serverName)}** ${payload.status === "started" ? "is ready." : "stopped cleanly."}`,
        color: payload.status === "started" ? 0x57f287 : 0x99aab5,
      },
      { server: payload.serverName },
    );
  }

  notifyCrash(payload: ServerCrashedNotifyPayload): void {
    this.enqueue(
      "serverCrashed",
      payload.serverId,
      {
        title: "Server crashed",
        description: `**${safeText(payload.serverName)}** exited unexpectedly.`,
        color: 0xed4245,
      },
      { server: payload.serverName },
    );
  }

  notifyClosedByUser(payload: DiscordClosedByUserPayload): void {
    this.enqueue(
      "serverClosedByUser",
      payload.serverId,
      {
        title: "Closed by user",
        description: `**${safeText(payload.serverName)}** was closed by the user.`,
        color: 0x99aab5,
      },
      { server: payload.serverName },
    );
  }

  notifyUpdate(payload: DiscordUpdateEventPayload): void {
    const event = this.updatePreference(payload);
    if (event === null) return;
    const name = safeText(payload.serverName ?? "Server");
    const title =
      event === "updateStarted"
        ? "SteamCMD job started"
        : event === "updateCompleted"
          ? "SteamCMD job finished"
          : "SteamCMD job failed";
    this.enqueue(
      event,
      payload.serverId ?? payload.jobId ?? "fleet",
      {
        title,
        description: `**${name}** — ${safeText(payload.message)}`,
        color:
          event === "updateCompleted"
            ? 0x57f287
            : event === "updateFailed"
              ? 0xed4245
              : 0xfee75c,
      },
      { server: payload.serverName ?? "Server", detail: payload.message },
    );
  }

  private updatePreference(payload: DiscordUpdateEventPayload): DiscordWebhookEvent | null {
    if (payload.type === "update_started") return "updateStarted";
    if (!shouldNotifySteamCmdJobEvent(payload.type, payload.severity)) return null;
    if (payload.type === "update_completed") return "updateCompleted";
    return "updateFailed";
  }

  private enqueue(
    event: DiscordWebhookEvent,
    scope: string,
    embed: Record<string, unknown>,
    context: DiscordMessageContext,
  ): void {
    const preferences = this.getPreferences();
    if (!preferences.enabled || !preferences.events[event]) return;
    if (!isDiscordWebhookUrl(preferences.webhookUrl)) return;
    const template = preferences.customMessages[event];
    const description =
      template !== undefined && template.length > 0
        ? renderDiscordMessage(template, context)
        : typeof embed.description === "string"
          ? embed.description
          : "";
    const key = `${event}:${scope}`;
    const now = this.now();
    const last = this.lastSentAt.get(key);
    if (last !== undefined && now - last < DISCORD_COOLDOWN_MS) return;
    this.lastSentAt.set(key, now);
    this.deliveryChain = this.deliveryChain
      .then(() => this.deliver(preferences.webhookUrl, { ...embed, description }))
      .catch(() => undefined);
  }

  private async deliver(
    webhookUrl: string,
    embed: Record<string, unknown>,
  ): Promise<void> {
    if (!isDiscordWebhookUrl(webhookUrl)) {
      throw new Error("Enter a valid discord.com webhook URL");
    }
    const endpoint = new URL(webhookUrl.trim());
    endpoint.searchParams.set("wait", "true");
    let response: Response;
    try {
      response = await this.fetchImpl(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username: "YARK",
          allowed_mentions: { parse: [] },
          embeds: [{ ...embed, timestamp: new Date(this.now()).toISOString() }],
        }),
        signal: AbortSignal.timeout(DISCORD_TIMEOUT_MS),
      });
    } catch {
      throw new Error("Discord could not be reached");
    }
    if (!response.ok) {
      throw new Error(`Discord rejected the webhook (HTTP ${response.status})`);
    }
  }
}
