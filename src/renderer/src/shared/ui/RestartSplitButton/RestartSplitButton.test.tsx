import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import { RestartSplitButton } from "./RestartSplitButton";

function renderButton(overrides: Partial<React.ComponentProps<typeof RestartSplitButton>> = {}) {
  return render(
    <AppProviders>
      <RestartSplitButton
        countdown={null}
        manualRestartWarningsEnabled
        canRestartNow
        canRestartWithWarning
        onRestartNow={vi.fn()}
        onRestartWithWarning={vi.fn()}
        onCancel={vi.fn()}
        {...overrides}
      />
    </AppProviders>,
  );
}

describe("RestartSplitButton", () => {
  it("disables the restart options trigger when the server cannot restart", () => {
    renderButton({
      canRestartNow: false,
      canRestartWithWarning: false,
      title: "Wait for the file update to finish",
    });

    expect(screen.getByRole("button", { name: "Restart now" })).toHaveAttribute(
      "title",
      "Wait for the file update to finish",
    );
    expect(screen.getByRole("button", { name: "More restart options" })).toHaveAttribute(
      "title",
      "Wait for the file update to finish",
    );
  });

  it("uses the normal single restart button when manual warnings are off", () => {
    renderButton({ manualRestartWarningsEnabled: false });

    expect(screen.getByRole("button", { name: "Restart now" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "More restart options" })).toBeNull();
  });
});
