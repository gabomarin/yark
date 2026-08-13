import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import { Sidebar } from "@layout/Sidebar/Sidebar";

afterEach(() => {
  cleanup();
});

describe("Sidebar YARK version update affordance", () => {
  it("makes only the version label open What's new when no update is available", async () => {
    const user = userEvent.setup();
    const onWhatsNewClick = vi.fn();

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
          onWhatsNewClick={onWhatsNewClick}
        />
      </AppProviders>,
    );

    const button = screen.getByRole("button", {
      name: /what's new in yark v0\.5\.2/i,
    });
    expect(button).toHaveAttribute("data-yark-app-version");
    await user.click(button);
    expect(onWhatsNewClick).toHaveBeenCalledTimes(1);
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

  it("keeps update icon and version label as separate actions", async () => {
    const user = userEvent.setup();
    const onWhatsNewClick = vi.fn();
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
          onWhatsNewClick={onWhatsNewClick}
          onYarkUpdateClick={onYarkUpdateClick}
        />
      </AppProviders>,
    );

    const updateButton = screen.getByRole("button", {
      name: /yark update available, version 0\.6\.0/i,
    });
    expect(updateButton).toHaveAttribute("data-yark-update-version");
    expect(updateButton.querySelector("svg")).not.toBeNull();
    await user.click(updateButton);
    expect(onYarkUpdateClick).toHaveBeenCalledTimes(1);
    expect(onWhatsNewClick).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: /what's new in yark v0\.5\.2/i }),
    );
    expect(onWhatsNewClick).toHaveBeenCalledTimes(1);
    expect(onYarkUpdateClick).toHaveBeenCalledTimes(1);
  });

  it("sizes SteamCMD controls by UI density (#233)", () => {
    const { rerender } = render(
      <AppProviders density="compact">
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

    expect(screen.getByRole("button", { name: "SteamCMD ready" })).toHaveAttribute(
      "data-size",
      "md",
    );

    rerender(
      <AppProviders density="comfortable">
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

    expect(screen.getByRole("button", { name: "SteamCMD ready" })).toHaveAttribute(
      "data-size",
      "lg",
    );

    rerender(
      <AppProviders density="compact">
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

    expect(screen.getByRole("button", { name: "SteamCMD ready" })).toHaveAttribute(
      "data-size",
      "sm",
    );
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
