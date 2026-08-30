import type { ReactElement } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppProviders } from "@app/AppProviders";
import { ServerRuntimeStatusBadge } from "./ServerRuntimeStatusBadge";

function renderBadge(ui: ReactElement): void {
  render(<AppProviders>{ui}</AppProviders>);
}

describe("ServerRuntimeStatusBadge", () => {
  it("renders the status label by default", () => {
    renderBadge(<ServerRuntimeStatusBadge status="running" />);
    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Running" })).toHaveAttribute(
      "data-runtime-status",
    );
    expect(document.querySelector(".mantine-Badge-root")).toBeNull();
  });

  it("renders a status-only dot with accessible name (#302)", () => {
    renderBadge(<ServerRuntimeStatusBadge status="running" appearance="dot" />);
    const dot = screen.getByRole("status", { name: "Running" });
    expect(dot).toHaveAttribute("data-runtime-status-dot");
    expect(dot).toHaveAttribute("data-tone", "ok");
    expect(screen.queryByText("Running")).not.toBeInTheDocument();
  });

  it("pulses the dot while starting / stopping", () => {
    renderBadge(<ServerRuntimeStatusBadge status="starting" appearance="dot" />);
    expect(screen.getByRole("status", { name: "Starting" })).toHaveAttribute(
      "data-processing",
      "true",
    );
  });
});
