import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MantineProvider } from "@mantine/core";
import { SettingsDiscordSection } from "./SettingsDiscordSection";

const preferences = {
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

afterEach(() => vi.unstubAllGlobals());

describe("SettingsDiscordSection", () => {
  it("handles the master and event switches without crashing", async () => {
    const api = {
      getDiscordWebhook: vi.fn().mockResolvedValue({ ok: true, data: preferences }),
      setDiscordWebhook: vi.fn((next) => Promise.resolve({ ok: true, data: next })),
      testDiscordWebhook: vi.fn(),
    };
    vi.stubGlobal("api", api);
    const user = userEvent.setup();
    render(
      <MantineProvider>
        <SettingsDiscordSection />
      </MantineProvider>,
    );

    const master = await screen.findByRole("switch", { name: "Discord alerts" });
    await user.click(master);
    expect(master).toBeChecked();

    const crash = screen.getByRole("checkbox", { name: "Server crash" });
    await user.click(crash);
    expect(crash).not.toBeChecked();
    expect(screen.queryByText("YARK renderer crashed")).not.toBeInTheDocument();
  });

  it("saves a valid webhook and sends a test", async () => {
    const api = {
      getDiscordWebhook: vi.fn().mockResolvedValue({ ok: true, data: preferences }),
      setDiscordWebhook: vi.fn().mockResolvedValue({
        ok: true,
        data: { ...preferences, enabled: true, webhookUrl: "https://discord.com/api/webhooks/123/token" },
      }),
      testDiscordWebhook: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    };
    vi.stubGlobal("api", api);
    const user = userEvent.setup();
    render(
      <MantineProvider>
        <SettingsDiscordSection />
      </MantineProvider>,
    );

    const input = await screen.findByLabelText("Webhook URL");
    await user.type(input, "https://discord.com/api/webhooks/123/token");
    await user.tab();
    await waitFor(() => expect(api.setDiscordWebhook).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "Send test" }));
    await waitFor(() =>
      expect(api.testDiscordWebhook).toHaveBeenCalledWith("https://discord.com/api/webhooks/123/token", undefined),
    );
  });

  it("persists a per-event custom message template on blur", async () => {
    const api = {
      getDiscordWebhook: vi.fn().mockResolvedValue({ ok: true, data: { ...preferences, enabled: true } }),
      setDiscordWebhook: vi.fn().mockResolvedValue({
        ok: true,
        data: { ...preferences, enabled: true, customMessages: { serverCrashed: "The {server} world is down" } },
      }),
      testDiscordWebhook: vi.fn(),
    };
    vi.stubGlobal("api", api);
    const user = userEvent.setup();
    render(
      <MantineProvider>
        <SettingsDiscordSection />
      </MantineProvider>,
    );

    await user.click(await screen.findByRole("button", { name: "Customize message for Server crash" }));
    const field = screen.getByLabelText("Custom message for Server crash");
    await user.click(field);
    await user.paste("The {server} world is down");
    await user.tab();

    await waitFor(() => {
      const saved = api.setDiscordWebhook.mock.calls.at(-1)?.[0] as {
        customMessages: Record<string, string>;
      };
      expect(saved.customMessages.serverCrashed).toBe("The {server} world is down");
    });
  });

  it("groups events, shows live template previews, and flags {detail} misuse", async () => {
    const api = {
      getDiscordWebhook: vi.fn().mockResolvedValue({ ok: true, data: { ...preferences, enabled: true } }),
      setDiscordWebhook: vi.fn().mockResolvedValue({ ok: true, data: { ...preferences, enabled: true } }),
      testDiscordWebhook: vi.fn(),
    };
    vi.stubGlobal("api", api);
    const user = userEvent.setup();
    render(
      <MantineProvider>
        <SettingsDiscordSection />
      </MantineProvider>,
    );

    expect(screen.getByText("Server events")).toBeInTheDocument();
    expect(screen.getByText("SteamCMD jobs")).toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: "Customize message for SteamCMD started" }));
    const steamCmd = screen.getByLabelText("Custom message for SteamCMD started");
    await user.click(steamCmd);
    await user.paste("Update queued for {server}: {detail}");
    expect(screen.getByText(/Preview: Update queued for Island: steamcmd exited with code 7/)).toBeInTheDocument();
    expect(screen.queryByText(/`\{detail\}` works only in SteamCMD events/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Customize message for Server crash" }));
    const crash = screen.getByLabelText("Custom message for Server crash");
    await user.click(crash);
    await user.paste("The {server} world is down");
    expect(screen.getByText(/Preview: The Island world is down/)).toBeInTheDocument();
    await user.click(crash);
    await user.paste(": {detail}");
    expect(
      screen.getByText(/`\{detail\}` works only in SteamCMD events; it won't be filled in here\./),
    ).toBeInTheDocument();
  });

  it("sends a test notification using the focused field's template", async () => {
    const api = {
      getDiscordWebhook: vi.fn().mockResolvedValue({
        ok: true,
        data: { ...preferences, enabled: true, webhookUrl: "https://discord.com/api/webhooks/123/token" },
      }),
      setDiscordWebhook: vi.fn().mockResolvedValue({
        ok: true,
        data: {
          ...preferences,
          enabled: true,
          webhookUrl: "https://discord.com/api/webhooks/123/token",
          customMessages: { serverCrashed: "The {server} world is down" },
        },
      }),
      testDiscordWebhook: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    };
    vi.stubGlobal("api", api);
    const user = userEvent.setup();

    render(
      <MantineProvider>
        <SettingsDiscordSection />
      </MantineProvider>,
    );

    await user.click(await screen.findByRole("button", { name: "Customize message for Server crash" }));
    const crash = screen.getByLabelText("Custom message for Server crash");
    await user.click(crash);
    await user.paste("The {server} world is down");
    await user.tab();
    await waitFor(() => expect(api.setDiscordWebhook).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: "Send test" }));
    await waitFor(() =>
      expect(api.testDiscordWebhook).toHaveBeenCalledWith(
        "https://discord.com/api/webhooks/123/token",
        "The Island world is down",
      ),
    );
  });
});
