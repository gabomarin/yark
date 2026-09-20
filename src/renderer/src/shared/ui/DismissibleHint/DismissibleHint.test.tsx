import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { AppProviders } from "@app/AppProviders";
import { DismissibleHint } from "./DismissibleHint";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("DismissibleHint (InfoBar)", () => {
  it("shows title and body with info tone by default", () => {
    const { container } = render(
      <AppProviders>
        <DismissibleHint storageKey="test-hint" title="Gotcha title">
          Body copy for the operator.
        </DismissibleHint>
      </AppProviders>,
    );
    expect(screen.getByText("Gotcha title")).toBeInTheDocument();
    expect(screen.getByText("Body copy for the operator.")).toBeInTheDocument();
    expect(container.querySelector("[data-tone='info']")).toBeTruthy();
  });

  it("dismisses and stays dismissed for the storage key", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <AppProviders>
        <DismissibleHint storageKey="test-hint-dismiss" title="Dismiss me">
          Once.
        </DismissibleHint>
      </AppProviders>,
    );
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText("Dismiss me")).not.toBeInTheDocument();

    rerender(
      <AppProviders>
        <DismissibleHint storageKey="test-hint-dismiss" title="Dismiss me">
          Once.
        </DismissibleHint>
      </AppProviders>,
    );
    expect(screen.queryByText("Dismiss me")).not.toBeInTheDocument();
  });
});
