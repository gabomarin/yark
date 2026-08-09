import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import { ServerModsTable } from "./ServerModsTable";
import type { ModRow } from "./serverModsModel";

const rows: ModRow[] = [
  {
    key: "id:1",
    id: "1",
    slug: "alpha",
    name: "Alpha Mod",
    author: "A",
    summary: "",
    thumbnailUrl: null,
    category: null,
    downloads: "1 downloads",
    downloadCount: 1,
    updated: "Jan 1",
    updatedAt: 1,
    url: "https://example.com/a",
    configured: true,
    enabled: true,
    loadIndex: 0,
  },
  {
    key: "id:2",
    id: "2",
    slug: "zeta",
    name: "Zeta Mod",
    author: "Z",
    summary: "",
    thumbnailUrl: null,
    category: null,
    downloads: "9 downloads",
    downloadCount: 9,
    updated: "Jan 2",
    updatedAt: 2,
    url: "https://example.com/z",
    configured: true,
    enabled: true,
    loadIndex: 1,
  },
];

describe("ServerModsTable", () => {
  it("confirms before removing from the row context menu", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();

    render(
      <AppProviders>
        <ServerModsTable
          rows={rows}
          mode="server"
          busyKey={null}
          onInspect={vi.fn()}
          onAdd={vi.fn()}
          onToggle={vi.fn()}
          onRemove={onRemove}
          onOpenExternal={vi.fn()}
          onReorder={vi.fn()}
        />
      </AppProviders>,
    );

    const row = document.querySelector("[data-mod-row]");
    expect(row).not.toBeNull();
    fireEvent.contextMenu(row!);

    await user.click(
      await screen.findByRole("menuitem", { name: /Remove Alpha Mod/i }),
    );
    expect(onRemove).not.toHaveBeenCalled();

    await user.click(await screen.findByRole("button", { name: "Remove mod" }));
    expect(onRemove).toHaveBeenCalledWith("1");
  });

  it("disables drag handles while view-sorted and exposes clear-sort", async () => {
    const user = userEvent.setup();
    render(
      <AppProviders>
        <ServerModsTable
          rows={rows}
          mode="server"
          busyKey={null}
          onInspect={vi.fn()}
          onAdd={vi.fn()}
          onToggle={vi.fn()}
          onRemove={vi.fn()}
          onOpenExternal={vi.fn()}
          onReorder={vi.fn()}
        />
      </AppProviders>,
    );

    expect(
      screen.getByRole("button", { name: "Reorder Alpha Mod" }),
    ).toBeTruthy();

    // Sortable header is a th control; click the Mod title to enter view-sort.
    const modHeader = screen.getByText("Mod", { selector: "th, th *" });
    await user.click(modHeader.closest("th") ?? modHeader);
    expect(await screen.findByText("View sorted")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reorder unavailable for Alpha Mod" }),
    ).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Clear sort" }));
    expect(screen.queryByText("View sorted")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reorder Alpha Mod" }),
    ).toBeTruthy();
  });

  it("disables drag while a list mutation busy key is set", () => {
    render(
      <AppProviders>
        <ServerModsTable
          rows={rows}
          mode="server"
          busyKey="reorder"
          onInspect={vi.fn()}
          onAdd={vi.fn()}
          onToggle={vi.fn()}
          onRemove={vi.fn()}
          onOpenExternal={vi.fn()}
          onReorder={vi.fn()}
        />
      </AppProviders>,
    );

    expect(
      screen.getByRole("button", { name: "Reorder unavailable for Alpha Mod" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("switch", { name: "Disable Alpha Mod" }),
    ).toBeDisabled();
  });
});
