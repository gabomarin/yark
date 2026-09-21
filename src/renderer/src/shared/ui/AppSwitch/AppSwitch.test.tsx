import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import { AppSwitch } from "./AppSwitch";

describe("AppSwitch", () => {
  it("shows the requested state while a parent update is still pending", async () => {
    let finishUpdate: (() => void) | undefined;
    const onCheckedChange = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishUpdate = resolve;
        }),
    );

    render(
      <AppProviders>
        <AppSwitch aria-label="Feature" checked={false} deferChange onCheckedChange={onCheckedChange} />
      </AppProviders>,
    );

    const toggle = screen.getByRole("switch", { name: "Feature" });
    fireEvent.click(toggle);

    expect(toggle).toBeChecked();
    expect(onCheckedChange).toHaveBeenCalledWith(true);

    // A successful write must not snap the knob back: the parent owns `checked` and may
    // commit it later (or never, for a parent that only reports the intent). Snapping here
    // is the pre-click flash this component exists to prevent.
    await act(async () => finishUpdate?.());
    expect(toggle).toBeChecked();
  });

  it("reconciles with the controlled state after a rejected update", async () => {
    const onCheckedChange = vi.fn(async () => {
      throw new Error("save failed");
    });
    render(
      <AppProviders>
        <AppSwitch aria-label="Feature" checked={false} onCheckedChange={onCheckedChange} />
      </AppProviders>,
    );

    const toggle = screen.getByRole("switch", { name: "Feature" });
    fireEvent.click(toggle);
    expect(toggle).toBeChecked();

    await act(async () => Promise.resolve());
    expect(toggle).not.toBeChecked();
  });

  it("follows an externally driven checked change without a stale frame", () => {
    const onCheckedChange = vi.fn();
    const view = (checked: boolean) => (
      <AppProviders>
        <AppSwitch aria-label="Feature" checked={checked} onCheckedChange={onCheckedChange} />
      </AppProviders>
    );

    const { rerender } = render(view(false));
    const toggle = screen.getByRole("switch", { name: "Feature" });
    expect(toggle).not.toBeChecked();

    // A reload or a rollback elsewhere moves the prop: the knob must show it on that paint.
    rerender(view(true));
    expect(toggle).toBeChecked();
  });
});
