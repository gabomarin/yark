import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import { BackupProtectionEditor } from "./BackupProtectionEditor";

describe("BackupProtectionEditor", () => {
  it("disables the note while unprotected but keeps the typed value", async () => {
    const user = userEvent.setup();
    const onIsProtectedChange = vi.fn();
    const onOperatorNoteChange = vi.fn();

    const { rerender } = render(
      <AppProviders>
        <BackupProtectionEditor
          isProtected
          operatorNote="keep this"
          saving={false}
          onIsProtectedChange={onIsProtectedChange}
          onOperatorNoteChange={onOperatorNoteChange}
          onSave={vi.fn()}
          onCancel={vi.fn()}
        />
      </AppProviders>,
    );

    const note = screen.getByLabelText(/Operator note/i);
    expect(note).toBeEnabled();
    expect(note).toHaveValue("keep this");

    await user.click(screen.getByRole("switch", { name: /Protected/i }));
    expect(onIsProtectedChange).toHaveBeenCalledWith(false);

    rerender(
      <AppProviders>
        <BackupProtectionEditor
          isProtected={false}
          operatorNote="keep this"
          saving={false}
          onIsProtectedChange={onIsProtectedChange}
          onOperatorNoteChange={onOperatorNoteChange}
          onSave={vi.fn()}
          onCancel={vi.fn()}
        />
      </AppProviders>,
    );

    expect(screen.getByLabelText(/Operator note/i)).toBeDisabled();
    expect(screen.getByLabelText(/Operator note/i)).toHaveValue("keep this");
  });

  it("keeps Save available while saving=false and Cancel calls onCancel", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onSave = vi.fn();

    render(
      <AppProviders>
        <BackupProtectionEditor
          isProtected
          operatorNote=""
          saving={false}
          onIsProtectedChange={vi.fn()}
          onOperatorNoteChange={vi.fn()}
          onSave={onSave}
          onCancel={onCancel}
        />
      </AppProviders>,
    );

    await user.click(screen.getByRole("button", { name: /^Cancel$/i }));
    expect(onCancel).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /^Save$/i }));
    expect(onSave).toHaveBeenCalled();
  });

  it("disables Cancel and leaves Save in a loading state while saving", () => {
    render(
      <AppProviders>
        <BackupProtectionEditor
          isProtected
          operatorNote="note"
          saving
          onIsProtectedChange={vi.fn()}
          onOperatorNoteChange={vi.fn()}
          onSave={vi.fn()}
          onCancel={vi.fn()}
        />
      </AppProviders>,
    );

    expect(screen.getByRole("button", { name: /^Cancel$/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^Save$/i })).toBeDisabled();
  });
});
