import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import type { AppEvent } from "@shared/types";
import { RecentActivityPanel } from "./RecentActivityPanel";

function event(id: number, type: AppEvent["type"], message: string): AppEvent {
  return {
    id,
    serverId: "srv-1",
    type,
    severity: "info",
    message,
    createdAt: `2026-07-24T10:0${id}:00.000Z`,
    details: null,
  };
}

describe("RecentActivityPanel", () => {
  it("uses compact skeleton rows while activity is loading", () => {
    const { container } = render(
      <AppProviders>
        <RecentActivityPanel events={[]} loading onViewAll={vi.fn()} />
      </AppProviders>,
    );

    expect(screen.getByText("Loading recent activity")).toBeInTheDocument();
    expect(container.querySelectorAll("[data-recent-activity] [aria-hidden='true']")).toHaveLength(
      3,
    );
  });

  it("shows five operational events, removes RCON noise and opens the full logs", () => {
    const onViewAll = vi.fn();
    const events = [
      event(1, "rcon_command", "RCON on The Island: ListPlayers"),
      event(2, "server_started", "Server started"),
      event(3, "backup_created", "Backup created"),
      event(4, "update_started", "Update started"),
      event(5, "update_completed", "Update completed"),
      event(6, "server_stopped", "Server stopped"),
      event(7, "server_updated", "This sixth event stays in Logs"),
    ];

    const { container } = render(
      <AppProviders>
        <RecentActivityPanel events={events} loading={false} onViewAll={onViewAll} />
      </AppProviders>,
    );
    const panel = within(container);

    expect(panel.queryByText(/RCON en/)).not.toBeInTheDocument();
    expect(container.querySelectorAll("[data-recent-activity] [title]")).toHaveLength(5);
    expect(panel.queryByText("This sixth event stays in Logs")).not.toBeInTheDocument();

    fireEvent.click(panel.getByRole("button", { name: "View logs" }));
    expect(onViewAll).toHaveBeenCalledOnce();
  });
});
