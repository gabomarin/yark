import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import type { ChangelogEntry } from "@shared/changelog";
import { AppChangelogModal } from "@features/settings/components/AppChangelogModal";

const entries: ChangelogEntry[] = [
  {
    version: "0.11.0",
    date: "2026-08-12",
    sections: [
      { title: "Added", items: ["In-app changelog notes."] },
      { title: "Fixed", items: ["A small bug."] },
    ],
  },
  {
    version: "0.10.0",
    date: "2026-08-01",
    sections: [{ title: "Changed", items: ["Older note."] }],
  },
];

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AppChangelogModal", () => {
  it("opens What's new for the current version and can browse recent", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onDismiss = vi.fn();
    vi.stubGlobal("api", {
      openYarkReleaseNotes: vi.fn().mockResolvedValue({ ok: true }),
    });

    render(
      <AppProviders>
        <AppChangelogModal
          opened
          onClose={onClose}
          onDismiss={onDismiss}
          appVersion="0.11.0"
          initialTab="current"
          entries={entries}
        />
      </AppProviders>,
    );

    expect(screen.getByText(/What's new in v0\.11\.0/i)).toBeInTheDocument();
    expect(screen.getByText("In-app changelog notes.")).toBeInTheDocument();
    expect(screen.queryByText("Older note.")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /browse recent/i }));
    expect(screen.getByText("Older note.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /got it/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
