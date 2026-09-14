import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppErrorBoundary } from "./AppErrorBoundary";

function Boom(): null {
  throw new Error("renderer exploded");
}

describe("AppErrorBoundary", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders children when nothing throws", () => {
    render(
      <AppErrorBoundary>
        <div>ok</div>
      </AppErrorBoundary>,
    );
    expect(screen.getByText("ok")).toBeInTheDocument();
  });

  it("shows Reload chrome instead of blanking the tree", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <AppErrorBoundary>
        <Boom />
      </AppErrorBoundary>,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveAttribute("data-app-error-boundary");
    expect(alert).toHaveTextContent(/YARK hit an error/i);
    expect(alert).toHaveTextContent(/renderer exploded/i);
    expect(screen.getByRole("button", { name: /reload yark/i })).toBeInTheDocument();
    spy.mockRestore();
  });
});
