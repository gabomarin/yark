import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import { setupUser } from "@renderer/test/setupUser";
import { ConfigurationEditorStatusAlerts } from "./ConfigurationEditorStatusAlerts";

function renderAlerts(ui: React.ReactElement) {
  return render(<AppProviders>{ui}</AppProviders>);
}

describe("ConfigurationEditorStatusAlerts", () => {
  it("shows an info banner for external changes in visual mode (#667)", () => {
    renderAlerts(
      <ConfigurationEditorStatusAlerts
        error={null}
        onDismissError={vi.fn()}
        externalChangeDetected
        iniMode="visual"
        baseline={{ gameUserSettings: "[ServerSettings]\nXPMultiplier=1\n", game: "" }}
        externalDiskPayload={{
          gameUserSettings: "[ServerSettings]\nXPMultiplier=1\nTamingSpeedMultiplier=9\n",
          game: "",
        }}
        serverActive={false}
        filesJobActive={false}
        pendingQueued={false}
      />,
    );
    const alert = screen.getByRole("alert", { name: "INI updated outside YARK" });
    expect(alert).toBeVisible();
    expect(alert).toHaveTextContent(/changed 1 setting outside YARK/i);
    expect(alert).toHaveTextContent(/Click Save to merge/i);
    expect(screen.getByRole("button", { name: "View outside changes" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Reload from disk" })).not.toBeInTheDocument();
  });

  it("closes the outside-changes popover on Escape", async () => {
    const user = setupUser();
    renderAlerts(
      <ConfigurationEditorStatusAlerts
        error={null}
        onDismissError={vi.fn()}
        externalChangeDetected
        iniMode="visual"
        baseline={{ gameUserSettings: "[ServerSettings]\nXPMultiplier=1\n", game: "" }}
        externalDiskPayload={{
          gameUserSettings: "[ServerSettings]\nXPMultiplier=1\nTamingSpeedMultiplier=9\n",
          game: "",
        }}
        serverActive={false}
        filesJobActive={false}
        pendingQueued={false}
      />,
    );
    const link = screen.getByRole("button", { name: "View outside changes" });
    await user.click(link);
    expect(link).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByText("TamingSpeedMultiplier")).toBeVisible();
    await user.keyboard("{Escape}");
    expect(link).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("TamingSpeedMultiplier")).not.toBeInTheDocument();
  });

  it("keeps an attention banner for external changes in text mode (#665)", () => {
    renderAlerts(
      <ConfigurationEditorStatusAlerts
        error={null}
        onDismissError={vi.fn()}
        externalChangeDetected
        iniMode="text"
        serverActive={false}
        filesJobActive={false}
        pendingQueued={false}
      />,
    );
    const alert = screen.getByRole("alert", { name: "INI changed outside YARK" });
    expect(alert).toBeVisible();
    expect(alert).toHaveTextContent(/refuse to overwrite/i);
  });

  it("uses a conflict title when Save fails on a stale/overlapping document", () => {
    renderAlerts(
      <ConfigurationEditorStatusAlerts
        error="XPMultiplier changed outside YARK"
        onDismissError={vi.fn()}
        staleDocument
        iniMode="visual"
        serverActive={false}
        filesJobActive={false}
        pendingQueued={false}
      />,
    );
    expect(screen.getByRole("alert", { name: "INI conflict" })).toHaveTextContent(/XPMultiplier/);
  });
});
