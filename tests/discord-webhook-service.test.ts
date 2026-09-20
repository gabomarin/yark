import { describe, expect, it, vi } from "vitest";
import { DiscordWebhookService } from "../src/main/discord-webhook-service";
import type { AppSettingsRepository } from "../src/backend/infra/db/app-settings-repository";

function settingsWith(raw: string | null): AppSettingsRepository {
  return { get: vi.fn().mockReturnValue(raw) } as unknown as AppSettingsRepository;
}

describe("DiscordWebhookService", () => {
  it("sends a safe test embed and requests delivery confirmation", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const service = new DiscordWebhookService(settingsWith(null), fetchImpl as typeof fetch, () =>
      Date.parse("2026-09-15T12:00:00.000Z"),
    );

    await service.test("https://discord.com/api/webhooks/123/secret-token");

    const [endpoint, options] = fetchImpl.mock.calls[0] as [URL, RequestInit];
    expect(endpoint.hostname).toBe("discord.com");
    expect(endpoint.searchParams.get("wait")).toBe("true");
    const body = JSON.parse(String(options.body)) as {
      allowed_mentions: { parse: string[] };
      embeds: Array<{ title: string; description: string }>;
    };
    expect(body.allowed_mentions.parse).toEqual([]);
    expect(body.embeds[0]?.title).toBe("YARK connection test");
    expect(body.embeds[0]?.description).toBe("Discord notifications are configured correctly.");
  });

  it("uses the provided description when the operator tests with a template", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const service = new DiscordWebhookService(settingsWith(null), fetchImpl as typeof fetch, () =>
      Date.parse("2026-09-15T12:00:00.000Z"),
    );

    await service.test("https://discord.com/api/webhooks/123/secret-token", "Island is welcoming survivors!");

    const [endpoint, options] = fetchImpl.mock.calls[0] as [URL, RequestInit];
    const body = JSON.parse(String(options.body)) as {
      embeds: Array<{ description: string }>;
    };
    expect(endpoint.hostname).toBe("discord.com");
    expect(body.embeds[0]?.description).toBe("Island is welcoming survivors!");
  });

  it("never includes the secret URL in delivery errors", async () => {
    const service = new DiscordWebhookService(
      settingsWith(null),
      vi.fn().mockResolvedValue(new Response("bad token", { status: 401 })) as typeof fetch,
    );
    const url = "https://discord.com/api/webhooks/123/super-secret";
    await expect(service.test(url)).rejects.toThrow("HTTP 401");
    await expect(service.test(url)).rejects.not.toThrow("super-secret");
  });

  it("honors event filters and suppresses duplicate alerts during cooldown", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const raw = JSON.stringify({
      enabled: true,
      webhookUrl: "https://discord.com/api/webhooks/123/secret-token",
      events: {
        serverStarted: true,
        serverStopped: false,
        serverCrashed: true,
        updateStarted: true,
        updateCompleted: true,
        updateFailed: true,
      },
      customMessages: {},
    });
    const service = new DiscordWebhookService(settingsWith(raw), fetchImpl as typeof fetch, () => 1_000_000);

    service.notifyLifecycle({ serverId: "island", serverName: "Island", status: "started" });
    service.notifyLifecycle({ serverId: "island", serverName: "Island", status: "started" });
    service.notifyLifecycle({ serverId: "island", serverName: "Island", status: "stopped" });

    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
  });

  it("uses the custom message template when an event has one", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const raw = JSON.stringify({
      enabled: true,
      webhookUrl: "https://discord.com/api/webhooks/123/secret-token",
      events: {
        serverStarted: true,
        serverStopped: true,
        serverCrashed: true,
        updateStarted: true,
        updateCompleted: true,
        updateFailed: true,
      },
      customMessages: {
        serverStarted: "{server} is welcoming survivors!",
      },
    });
    const service = new DiscordWebhookService(settingsWith(raw), fetchImpl as typeof fetch, () => 1_000_000);

    service.notifyLifecycle({ serverId: "island", serverName: "Island", status: "started" });
    service.notifyLifecycle({ serverId: "island", serverName: "Island", status: "stopped" });

    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));
    const startedBody = JSON.parse(String((fetchImpl.mock.calls[0]?.[1] as RequestInit).body)) as {
      embeds: Array<{ description: string }>;
    };
    const stoppedBody = JSON.parse(String((fetchImpl.mock.calls[1]?.[1] as RequestInit).body)) as {
      embeds: Array<{ description: string }>;
    };
    expect(startedBody.embeds[0]?.description).toBe("Island is welcoming survivors!");
    expect(stoppedBody.embeds[0]?.description).toBe("**Island** stopped cleanly.");
  });
});
