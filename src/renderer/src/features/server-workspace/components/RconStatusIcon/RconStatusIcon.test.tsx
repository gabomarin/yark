import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import { RconStatusIcon } from "./RconStatusIcon";

describe("RconStatusIcon", () => {
  beforeEach(() => {
    vi.stubGlobal("api", {
      getRconStatus: vi.fn(() => new Promise(() => undefined)),
      retryRconConnection: vi.fn(),
      onRconStatusChanged: vi.fn(() => () => undefined),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders a stable disconnected status while the initial status is pending", () => {
    render(
      <AppProviders>
        <RconStatusIcon serverId="srv-a" />
      </AppProviders>,
    );

    expect(
      screen.getByText("RCON: disconnected - click to retry"),
    ).toBeInTheDocument();
  });

  it("lets the user retry a disconnected RCON session", async () => {
    const user = userEvent.setup();
    vi.mocked(window.api.getRconStatus).mockResolvedValue({
      ok: true,
      data: {
        serverId: "srv-retry",
        status: "disconnected",
        lastError: "Connection closed",
      },
    });
    const retryRconConnection = vi.fn(async () => ({
      ok: true as const,
      data: undefined,
    }));
    Object.assign(window.api, { retryRconConnection });

    render(
      <AppProviders>
        <RconStatusIcon serverId="srv-retry" />
      </AppProviders>,
    );

    await user.click(
      await screen.findByText("RCON: disconnected - click to retry"),
    );

    expect(retryRconConnection).toHaveBeenCalledWith("srv-retry");
  });
});
