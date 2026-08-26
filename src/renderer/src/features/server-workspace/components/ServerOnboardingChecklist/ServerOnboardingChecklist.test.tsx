import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import type { ServerInstallationInfo, ServerProfile } from "@shared/types";
import { ServerOnboardingChecklist } from "./ServerOnboardingChecklist";

const server = {
  id: "srv-1",
  name: "The Island",
} as ServerProfile;

const readyInstall = {
  serverId: "srv-1",
  installed: true,
  health: "ready",
  reasonCodes: [],
  guidance: "",
  build: null,
  steamBuild: null,
  arkVersion: null,
  version: null,
  binaryPath: "C:\\ARK\\ShooterGame\\Binaries\\Win64\\ArkAscendedServer.exe",
  checkedAt: new Date().toISOString(),
} as ServerInstallationInfo;

function renderChecklist(installation: ServerInstallationInfo | null): {
  onInstallFiles: ReturnType<typeof vi.fn>;
  onOpenAssistant: ReturnType<typeof vi.fn>;
} {
  const onInstallFiles = vi.fn();
  const onOpenAssistant = vi.fn();
  render(
    <AppProviders>
      <ServerOnboardingChecklist
        server={server}
        installation={installation}
        onDismiss={vi.fn()}
        onOpenAssistant={onOpenAssistant}
        onInstallFiles={onInstallFiles}
      />
    </AppProviders>,
  );
  return { onInstallFiles, onOpenAssistant };
}

describe("ServerOnboardingChecklist", () => {
  it("uses Install files as the single filled primary when files are missing (#236)", () => {
    renderChecklist(null);

    const install = screen.getByRole("button", { name: "Install files" });
    const configure = screen.getByRole("button", { name: "Configure with wizard" });
    const useDefaults = screen.getByRole("button", { name: "Use defaults" });

    expect(install).toHaveAttribute("data-cta-prominence", "primary");
    expect(configure).toHaveAttribute("data-cta-prominence", "secondary");
    expect(useDefaults).toHaveAttribute("data-cta-prominence", "secondary");
    expect(
      screen.getAllByRole("button").filter(
        (button) => button.getAttribute("data-cta-prominence") === "primary",
      ),
    ).toHaveLength(1);
  });

  it("promotes Configure with wizard after files are ready (#236)", async () => {
    const user = userEvent.setup();
    const { onOpenAssistant } = renderChecklist(readyInstall);

    const configure = screen.getByRole("button", { name: "Configure with wizard" });
    expect(configure).toHaveAttribute("data-cta-prominence", "primary");
    expect(screen.queryByRole("button", { name: "Install files" })).not.toBeInTheDocument();

    await user.click(configure);
    expect(onOpenAssistant).toHaveBeenCalledOnce();
  });
});
