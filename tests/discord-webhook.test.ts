import { describe, expect, it } from "vitest";
import {
  isDiscordWebhookUrl,
  parseDiscordWebhookPreferences,
  renderDiscordMessage,
  sanitizeDiscordMessageTemplate,
} from "../src/shared/settings/discord-webhook";

describe("Discord webhook preferences", () => {
  it("accepts only official HTTPS webhook endpoints", () => {
    expect(isDiscordWebhookUrl("https://discord.com/api/webhooks/123/token-value")).toBe(true);
    expect(isDiscordWebhookUrl("http://discord.com/api/webhooks/123/token-value")).toBe(false);
    expect(isDiscordWebhookUrl("https://example.com/api/webhooks/123/token-value")).toBe(false);
    expect(isDiscordWebhookUrl("https://discord.com/api/webhooks/123/token-value/extra")).toBe(false);
  });

  it("falls back safely when stored JSON is malformed", () => {
    const value = parseDiscordWebhookPreferences("not json");
    expect(value.enabled).toBe(false);
    expect(value.webhookUrl).toBe("");
    expect(value.events.serverStarted).toBe(true);
    expect(value.events.serverClosedByUser).toBe(false);
    expect(value.customMessages).toEqual({});
  });

  it("merges missing event flags with enabled defaults", () => {
    const value = parseDiscordWebhookPreferences(JSON.stringify({
      enabled: true,
      webhookUrl: " https://discord.com/api/webhooks/123/token ",
      events: { serverCrashed: false },
    }));
    expect(value.webhookUrl).toBe("https://discord.com/api/webhooks/123/token");
    expect(value.events.serverCrashed).toBe(false);
    expect(value.events.serverStarted).toBe(true);
  });

  it("parses and sanitizes per-event custom message templates", () => {
    const value = parseDiscordWebhookPreferences(JSON.stringify({
      enabled: true,
      webhookUrl: "",
      customMessages: {
        serverStarted: "  {server} is up!  ",
        serverCrashed: "{unknown} @everyone {server} down",
      },
    }));
    expect(value.customMessages.serverStarted).toBe("{server} is up!");
    expect(value.customMessages.serverCrashed).toBe("@\u200beveryone {server} down");
    expect(value.customMessages.serverStopped).toBeUndefined();
  });
});

describe("Discord message templates", () => {
  it("sanitizes mentions and drops unknown tokens", () => {
    expect(sanitizeDiscordMessageTemplate("@everyone {server} @here")).toBe(
      "@\u200beveryone {server} @\u200bhere",
    );
    expect(sanitizeDiscordMessageTemplate("token {oops} ok")).toBe("token  ok");
    expect(sanitizeDiscordMessageTemplate("{message} {server}")).toBe("{server}");
    expect(sanitizeDiscordMessageTemplate("**bold** *italic* __u__ ~~s~~ `c`")).toBe(
      "**bold** *italic* __u__ ~~s~~ `c`",
    );
    expect(sanitizeDiscordMessageTemplate("   ")).toBe("");
  });

  it("interpolates whitelisted placeholders", () => {
    const rendered = renderDiscordMessage("{server}: {detail}", {
      server: "The Island",
      detail: "update done",
    });
    expect(rendered).toBe("The Island: update done");
  });

  it("reuses the server name when a detail token is absent", () => {
    const rendered = renderDiscordMessage("world of {server}", { server: "Extinction" });
    expect(rendered).toBe("world of Extinction");
  });

  it("drops {detail} when the event context has no detail", () => {
    expect(renderDiscordMessage("Issue {detail} on {server}", { server: "Island" })).toBe(
      "Issue on Island",
    );
    expect(renderDiscordMessage("Failed: {detail}", { server: "Island" })).toBe("Failed:");
  });
});
