import { render, screen, within } from "@testing-library/react";
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

  it("shows loaded, your edit, and disk as separate values", () => {
    renderAlerts(
      <ConfigurationEditorStatusAlerts
        error="XPMultiplier changed outside YARK"
        onDismissError={vi.fn()}
        staleDocument
        conflicts={[
          {
            kind: "scalar",
            fileKey: "gameUserSettings",
            section: "ServerSettings",
            key: "XPMultiplier",
            occurrence: 0,
            loaded: "1",
            local: "",
            disk: null,
          },
        ]}
        onAcceptConflicts={vi.fn()}
        onReloadStale={vi.fn()}
        iniMode="visual"
        serverActive={false}
        filesJobActive={false}
        pendingQueued={false}
      />,
    );
    const alert = screen.getByRole("alert", { name: "INI conflict" });
    expect(alert).toHaveTextContent(
      "Save did not write. This setting also changed in the file. Pick which value to use, then accept.",
    );
    expect(alert).toHaveTextContent("Last save");
    expect(alert).toHaveTextContent("Your edit");
    expect(alert).toHaveTextContent("Changed in YARK");
    expect(alert).toHaveTextContent("On disk");
    expect(alert).toHaveTextContent("Changed in the file");
    expect(alert).toHaveTextContent("Empty");
    expect(alert).toHaveTextContent("Not in the file");
    expect(screen.getByRole("radio", { name: "Revert to 1" })).toBeVisible();
    expect(screen.getByRole("radio", { name: "Use my value" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Use the file's value" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Accept" })).toBeVisible();
    expect(within(alert).getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Review conflicts" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show the file instead" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View file text" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reload from disk" })).not.toBeInTheDocument();
  });

  it("opens five conflicts in a dialog", async () => {
    const user = setupUser();
    renderAlerts(
      <ConfigurationEditorStatusAlerts
        error="Several settings changed outside YARK"
        onDismissError={vi.fn()}
        staleDocument
        conflicts={[
          "XPMultiplier",
          "TamingSpeedMultiplier",
          "HarvestAmountMultiplier",
          "DifficultyOffset",
          "PlayerDamageMultiplier",
        ].map((key) => ({
          kind: "scalar" as const,
          fileKey: "gameUserSettings" as const,
          section: "ServerSettings",
          key,
          occurrence: 0,
          loaded: "1",
          local: "2",
          disk: "3",
        }))}
        onAcceptConflicts={vi.fn()}
        iniMode="visual"
        serverActive={false}
        filesJobActive={false}
        pendingQueued={false}
      />,
    );
    expect(screen.queryByRole("radio", { name: "Use 2" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Review conflicts" }));
    const dialog = screen.getByRole("dialog", { name: "INI conflict" });
    expect(dialog).toBeVisible();
    expect(within(dialog).getAllByRole("radio", { name: "Use 2" })).toHaveLength(5);
    expect(within(dialog).getByRole("button", { name: "Accept" })).toBeVisible();
  });

  it("keeps the notice open until Accept", async () => {
    const user = setupUser();
    const onAccept = vi.fn();
    renderAlerts(
      <ConfigurationEditorStatusAlerts
        error="XPMultiplier changed outside YARK"
        onDismissError={vi.fn()}
        staleDocument
        conflicts={[
          {
            kind: "scalar",
            fileKey: "gameUserSettings",
            section: "ServerSettings",
            key: "XPMultiplier",
            occurrence: 0,
            loaded: "1",
            local: "",
            disk: null,
          },
        ]}
        onAcceptConflicts={onAccept}
        iniMode="visual"
        serverActive={false}
        filesJobActive={false}
        pendingQueued={false}
      />,
    );
    await user.click(screen.getByRole("radio", { name: "Revert to 1" }));
    expect(onAccept).not.toHaveBeenCalled();
    expect(screen.getByRole("alert", { name: "INI conflict" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Accept" }));
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onAccept.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({ side: "saved", conflict: expect.objectContaining({ key: "XPMultiplier" }) }),
    ]);
  });
});
