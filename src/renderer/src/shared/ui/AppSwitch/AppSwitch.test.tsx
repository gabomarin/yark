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

    await act(async () => finishUpdate?.());
    expect(toggle).not.toBeChecked();
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
});
