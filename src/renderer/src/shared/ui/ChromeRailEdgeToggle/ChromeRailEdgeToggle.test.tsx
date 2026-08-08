import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import { ChromeRailEdgeToggle } from "./ChromeRailEdgeToggle";

describe("ChromeRailEdgeToggle", () => {
  it("calls onToggle from the circular seam control", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();

    render(
      <AppProviders>
        <ChromeRailEdgeToggle
          iconMode={false}
          onToggle={onToggle}
          expandLabel="Expand navigation"
          collapseLabel="Collapse to icon rail"
        />
      </AppProviders>,
    );

    await user.click(screen.getByRole("button", { name: "Collapse to icon rail" }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("shows expand affordance in icon mode", () => {
    render(
      <AppProviders>
        <ChromeRailEdgeToggle
          iconMode
          onToggle={vi.fn()}
          expandLabel="Expand server list"
          collapseLabel="Collapse to icon rail"
        />
      </AppProviders>,
    );

    expect(screen.getByRole("button", { name: "Expand server list" })).toBeInTheDocument();
  });
});
