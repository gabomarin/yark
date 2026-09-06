import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import { QuitYarkModal } from "./QuitYarkModal";

afterEach(() => {
  cleanup();
});

describe("QuitYarkModal (#532)", () => {
  it("uses What's-new-style chrome and confirms quit", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onConfirm = vi.fn();

    render(
      <AppProviders>
        <QuitYarkModal opened onClose={onClose} onConfirm={onConfirm} />
      </AppProviders>,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("data-yark-quit-modal");
    expect(screen.getByText("Quit YARK?")).toBeInTheDocument();
    expect(screen.getByText(/closes the server manager on this pc/i)).toBeInTheDocument();
    expect(dialog).toHaveTextContent(/stopped safely first/i);
    expect(dialog).not.toHaveTextContent(/close the window instead/i);

    await user.click(screen.getByRole("button", { name: "Quit YARK" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("cancels without confirming", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onConfirm = vi.fn();

    render(
      <AppProviders>
        <QuitYarkModal opened onClose={onClose} onConfirm={onConfirm} />
      </AppProviders>,
    );

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
