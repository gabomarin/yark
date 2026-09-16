import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import { CrashRecoveryHeaderBadge } from "./CrashRecoveryHeaderBadge";

describe("CrashRecoveryHeaderBadge", () => {
  it("shows a live restart countdown", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    try {
      render(
        <AppProviders>
          <CrashRecoveryHeaderBadge
            recovery={{
              attempt: 2,
              maxAttempts: 3,
              restartAt: "2026-01-01T00:00:20.000Z",
              reason: "boom",
            }}
          />
        </AppProviders>,
      );
      expect(screen.getByText(/restarting in 20s/i)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders nothing when no retry is pending", () => {
    const { container } = render(
      <AppProviders>
        <CrashRecoveryHeaderBadge recovery={null} />
      </AppProviders>,
    );
    expect(container.querySelector("[data-crash-recovery-badge]")).toBeNull();
  });
});
