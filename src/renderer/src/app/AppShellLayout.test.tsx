import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "./AppProviders";
import { AppShellLayout } from "./AppShellLayout";

describe("AppShellLayout", () => {
  it("renders the sidebar and page content", () => {
    render(
      <AppProviders density="compact">
        <AppShellLayout
          route="overview"
          onNavigate={vi.fn()}
          steamCmdDetected={false}
          steamCmdRunning={false}
          officialVersion={null}
          appVersion="0.1.0"
        >
          <div>page-body</div>
        </AppShellLayout>
      </AppProviders>,
    );

    expect(screen.getByText("YARK")).toBeInTheDocument();
    expect(screen.getByText("page-body")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Servers" })).toHaveAttribute(
      "data-size",
      "md",
    );
  });

  it("renders and dismisses a global error banner", async () => {
    const onDismissError = vi.fn();

    render(
      <AppProviders>
        <AppShellLayout
          route="overview"
          onNavigate={vi.fn()}
          steamCmdDetected={false}
          steamCmdRunning={false}
          officialVersion={null}
          appVersion="0.1.0"
          error="Boom"
          onDismissError={onDismissError}
        >
          <div>page-body</div>
        </AppShellLayout>
      </AppProviders>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Boom");
    screen.getByRole("button", { name: /dismiss error/i }).click();
    expect(onDismissError).toHaveBeenCalledTimes(1);
  });
});
