import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import { ConfigurationEditorHeader } from "./ConfigurationEditorHeader";

function renderHeader(invalid: boolean) {
  render(
    <AppProviders>
      <ConfigurationEditorHeader
        fileLabel="Game.ini"
        subtitle="Edit {fileLabel}."
        openFileAction={null}
        iniNavigation={null}
        dirty
        invalid={invalid}
        busy={false}
        onDiscard={vi.fn()}
        onSave={vi.fn()}
      />
    </AppProviders>,
  );
}

describe("ConfigurationEditorHeader", () => {
  it("keeps Save off while an error is showing and leaves Discard available", () => {
    renderHeader(true);

    expect(screen.getAllByRole("button", { name: "Save", hidden: true })).toHaveLength(2);
    for (const button of screen.getAllByRole("button", { name: "Save", hidden: true })) {
      expect(button).toBeDisabled();
    }
    for (const button of screen.getAllByRole("button", { name: "Discard changes", hidden: true })) {
      expect(button).toBeEnabled();
    }
  });

  it("enables Save when the editor is dirty and valid", () => {
    renderHeader(false);

    for (const button of screen.getAllByRole("button", { name: "Save", hidden: true })) {
      expect(button).toBeEnabled();
    }
  });
});
