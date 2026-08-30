import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import { AppMetricCard } from "./AppMetricCard";

describe("AppMetricCard", () => {
  it("renders label, value, and hint", () => {
    render(
      <AppProviders>
        <AppMetricCard label="At risk" value="3" hint="Needs attention" />
      </AppProviders>,
    );

    expect(screen.getByText("At risk")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Needs attention")).toBeInTheDocument();
  });

  it("invokes onClick when used as a filter tile", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    render(
      <AppProviders>
        <AppMetricCard label="Protected" value="2/4" onClick={onClick} active />
      </AppProviders>,
    );

    const button = screen.getByRole("button", { name: /Protected/i });
    expect(button).toHaveAttribute("data-active");
    expect(button).toHaveAttribute("aria-pressed", "true");
    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("toggles from the keyboard as a pressed button (#477)", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    render(
      <AppProviders>
        <AppMetricCard label="Running" value="1" onClick={onClick} />
      </AppProviders>,
    );

    const button = screen.getByRole("button", { name: /Running/i });
    expect(button).toHaveAttribute("aria-pressed", "false");
    button.focus();
    await user.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledTimes(1);
    await user.keyboard(" ");
    expect(onClick).toHaveBeenCalledTimes(2);
  });
});

