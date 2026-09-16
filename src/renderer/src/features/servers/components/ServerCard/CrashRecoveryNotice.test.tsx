import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import { CrashRecoveryNotice } from "./CrashRecoveryNotice";

describe("CrashRecoveryNotice", () => {
  it("shows the recovery state, attempt budget, and a live countdown (#563)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    try {
      render(
        <AppProviders>
          <CrashRecoveryNotice
            recovery={{
              attempt: 2,
              maxAttempts: 3,
              restartAt: "2026-01-01T00:00:30.000Z",
              reason: "boom",
            }}
          />
        </AppProviders>,
      );
      expect(screen.getByText(/crash detected/i)).toBeInTheDocument();
      expect(screen.getByText(/attempt 2 of 3/i)).toBeInTheDocument();
      expect(screen.getByText(/restarting in 30s/i)).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(5_000);
      });
      expect(screen.getByText(/restarting in 25s/i)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("formats longer waits in minutes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    try {
      render(
        <AppProviders>
          <CrashRecoveryNotice
            recovery={{
              attempt: 1,
              maxAttempts: 3,
              restartAt: "2026-01-01T00:01:30.000Z",
              reason: null,
            }}
          />
        </AppProviders>,
      );
      expect(screen.getByText(/restarting in 1m 30s/i)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
