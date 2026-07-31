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
          officialNetworkStatus="unknown"
          appVersion="0.1.0"
        >
          <div>page-body</div>
        </AppShellLayout>
      </AppProviders>,
    );

    // Vite/Vitest resolves `*.png` imports to a URL string (see env.d.ts); no fileMock needed.
    const brand = screen.getByAltText("YARK server manager");
    expect(brand).toBeInTheDocument();
    expect(brand).toHaveAttribute("src", expect.stringMatching(/\S/));
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
          officialNetworkStatus="unknown"
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

  it("renders a blocking busy overlay over the shell", () => {
    render(
      <AppProviders density="compact">
        <AppShellLayout
          route="overview"
          onNavigate={vi.fn()}
          steamCmdDetected={false}
          steamCmdRunning={false}
          officialVersion={null}
          officialNetworkStatus="unknown"
          appVersion="0.1.0"
          busyOverlay={{
            title: "Stopping server",
            message: "Island: Saving world…",
            percent: 10,
          }}
        >
          <button type="button">should-be-blocked</button>
        </AppShellLayout>
      </AppProviders>,
    );

    expect(screen.getByRole("alertdialog")).toHaveAttribute("data-app-busy-overlay");
    expect(screen.getByText("Stopping server")).toBeInTheDocument();
    expect(screen.getByText("Island: Saving world…")).toBeInTheDocument();
  });
});
