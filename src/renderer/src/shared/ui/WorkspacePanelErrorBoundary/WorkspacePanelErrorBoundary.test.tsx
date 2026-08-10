import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import { WorkspacePanelErrorBoundary } from "./WorkspacePanelErrorBoundary";

function Boom(): null {
  throw new Error("panel exploded");
}

describe("WorkspacePanelErrorBoundary (#209)", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows a recoverable panel error instead of blanking the tree", async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { rerender } = render(
      <AppProviders>
        <div data-testid="shell">shell</div>
        <WorkspacePanelErrorBoundary resetKey="mods:s1">
          <Boom />
        </WorkspacePanelErrorBoundary>
      </AppProviders>,
    );

    expect(screen.getByTestId("shell")).toBeInTheDocument();
    expect(screen.getByText(/this panel hit an error/i)).toBeInTheDocument();
    expect(screen.getByText(/panel exploded/i)).toBeInTheDocument();

    rerender(
      <AppProviders>
        <div data-testid="shell">shell</div>
        <WorkspacePanelErrorBoundary resetKey="launch:s1">
          <div>recovered</div>
        </WorkspacePanelErrorBoundary>
      </AppProviders>,
    );
    expect(screen.getByText("recovered")).toBeInTheDocument();

    rerender(
      <AppProviders>
        <WorkspacePanelErrorBoundary resetKey="mods:s1">
          <Boom />
        </WorkspacePanelErrorBoundary>
      </AppProviders>,
    );
    await user.click(screen.getByRole("button", { name: /retry panel/i }));
    // Still Boom — retry remounts children; without key change Boom throws again.
    expect(screen.getByText(/this panel hit an error/i)).toBeInTheDocument();
    spy.mockRestore();
  });
});
