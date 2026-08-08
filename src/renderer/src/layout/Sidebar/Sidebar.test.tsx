import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import { Sidebar } from "@layout/Sidebar/Sidebar";

afterEach(() => {
  cleanup();
});

describe("Sidebar YARK version update affordance", () => {
  it("keeps a dimmed non-interactive version when no update is available", () => {
    render(
      <AppProviders>
        <Sidebar
          route="overview"
          onNavigate={vi.fn()}
          steamCmdDetected
          steamCmdRunning={false}
          officialVersion="1.0"
          officialNetworkStatus="online"
          appVersion="0.5.2"
        />
      </AppProviders>,
    );

    expect(screen.getByText("v0.5.2")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /yark update available/i }),
    ).not.toBeInTheDocument();
  });

  it("marks the active route on NavLink and navigates on click (#106)", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();

    render(
      <AppProviders>
        <Sidebar
          route="overview"
          onNavigate={onNavigate}
          steamCmdDetected
          steamCmdRunning={false}
          officialVersion="1.0"
          officialNetworkStatus="online"
          appVersion="0.5.2"
        />
      </AppProviders>,
    );

    expect(screen.getByRole("button", { name: "Servers" })).toHaveAttribute(
      "data-active",
    );
    expect(screen.getByRole("button", { name: "Clusters" })).not.toHaveAttribute(
      "data-active",
    );

    await user.click(screen.getByRole("button", { name: "Logs" }));
    expect(onNavigate).toHaveBeenCalledWith("logs");
  });

  it("accents the version and navigates on click when an update is available", async () => {
    const user = userEvent.setup();
    const onYarkUpdateClick = vi.fn();

    render(
      <AppProviders>
        <Sidebar
          route="overview"
          onNavigate={vi.fn()}
          steamCmdDetected
          steamCmdRunning={false}
          officialVersion="1.0"
          officialNetworkStatus="online"
          appVersion="0.5.2"
          yarkUpdateAvailableVersion="0.6.0"
          onYarkUpdateClick={onYarkUpdateClick}
        />
      </AppProviders>,
    );

    const button = screen.getByRole("button", {
      name: /yark update available, version 0\.6\.0/i,
    });
    expect(button).toHaveAttribute("data-yark-update-version");
    await user.click(button);
    expect(onYarkUpdateClick).toHaveBeenCalledTimes(1);
  });

  it("shows icon-only nav with tooltips in rail mode (#107)", () => {
    render(
      <AppProviders>
        <Sidebar
          route="overview"
          onNavigate={vi.fn()}
          steamCmdDetected
          steamCmdRunning={false}
          officialVersion="1.0"
          officialNetworkStatus="online"
          appVersion="0.5.2"
          iconMode
        />
      </AppProviders>,
    );

    expect(screen.getByRole("button", { name: "Servers" })).toBeInTheDocument();
    expect(screen.queryByText("ARK official version")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "SteamCMD ready" })).toBeInTheDocument();
  });

  it("hints Ctrl+K quick jump on the brand logo (#104)", async () => {
    const user = userEvent.setup();
    render(
      <AppProviders>
        <Sidebar
          route="overview"
          onNavigate={vi.fn()}
          steamCmdDetected
          steamCmdRunning={false}
          officialVersion="1.0"
          officialNetworkStatus="online"
          appVersion="0.5.2"
        />
      </AppProviders>,
    );

    await user.hover(screen.getByAltText("YARK server manager"));
    expect(
      await screen.findByRole("tooltip", { name: /Quick jump · Ctrl\+K/i }),
    ).toBeInTheDocument();
  });
});
