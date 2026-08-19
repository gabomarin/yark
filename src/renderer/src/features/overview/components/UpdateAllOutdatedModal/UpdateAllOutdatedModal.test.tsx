import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import { UpdateAllOutdatedModal } from "./UpdateAllOutdatedModal";
import type { UpdateAllOutdatedPlan } from "../../updateAllOutdatedModel";

const plan: UpdateAllOutdatedPlan = {
  officialBuild: "build 999",
  rows: [
    {
      serverId: "a",
      serverName: "Alpha",
      installBuild: "build 111",
      officialBuild: "build 999",
      status: "stopped",
      eligible: true,
      skipReason: null,
      skipLabel: null,
    },
    {
      serverId: "b",
      serverName: "Beta",
      installBuild: "build 222",
      officialBuild: "build 999",
      status: "running",
      eligible: false,
      skipReason: "server-running",
      skipLabel: "Server is running — stop it before a safe update.",
    },
  ],
  eligible: [
    {
      serverId: "a",
      serverName: "Alpha",
      installBuild: "build 111",
      officialBuild: "build 999",
      status: "stopped",
      eligible: true,
      skipReason: null,
      skipLabel: null,
    },
  ],
  skipped: [
    {
      serverId: "b",
      serverName: "Beta",
      installBuild: "build 222",
      officialBuild: "build 999",
      status: "running",
      eligible: false,
      skipReason: "server-running",
      skipLabel: "Server is running — stop it before a safe update.",
    },
  ],
};

describe("UpdateAllOutdatedModal", () => {
  it("lists eligible and skipped servers and confirms queue (#378)", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <AppProviders>
        <UpdateAllOutdatedModal
          opened
          plan={plan}
          onClose={vi.fn()}
          onConfirm={onConfirm}
        />
      </AppProviders>,
    );

    expect(screen.getByText(/1 server ready to queue/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Alpha build row")).toBeInTheDocument();
    expect(screen.getByLabelText("Beta build row")).toBeInTheDocument();
    expect(
      screen.getByText(/Server is running — stop it before a safe update/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /queue 1 update/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
