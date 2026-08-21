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
    categories: [],
    downloads: "1",
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
    categories: [],
    downloads: "9",
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

    const modHeader = screen.getByText("Mod", { selector: "th, th *" });
    await user.click(modHeader.closest("th") ?? modHeader);
    expect(
      await screen.findByRole("button", { name: "Clear sort" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reorder unavailable for Alpha Mod" }),
    ).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Clear sort" }));
    expect(
      screen.queryByRole("button", { name: "Clear sort" }),
    ).not.toBeInTheDocument();
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

  it("mutes disabled inventory rows instead of a Status badge (#226)", () => {
    const enabledRow = rows[0]!;
    const disabledRow: ModRow = { ...rows[1]!, enabled: false };
    render(
      <AppProviders>
        <ServerModsTable
          rows={[enabledRow, disabledRow]}
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

    const enabled = document.querySelector('[data-mod-enabled="true"]');
    const disabled = document.querySelector('[data-mod-enabled="false"]');
    expect(enabled).not.toBeNull();
    expect(disabled).not.toBeNull();
    expect(disabled?.className).toMatch(/disabledRow/);
    expect(document.querySelector("[data-mod-status]")).toBeNull();
  });

  it("shows one category badge under the name and +N for extras", async () => {
    const user = userEvent.setup();
    const mapRow: ModRow = {
      ...rows[0]!,
      categories: ["General", "Maps"],
    };
    render(
      <AppProviders>
        <ServerModsTable
          rows={[mapRow]}
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

    expect(screen.getByText("Maps")).toBeInTheDocument();
    expect(screen.getByText("+1")).toBeInTheDocument();
    expect(screen.queryByText("General")).not.toBeInTheDocument();

    await user.hover(screen.getByText("+1"));
    expect(await screen.findByRole("tooltip")).toHaveTextContent("General");
  });
});
