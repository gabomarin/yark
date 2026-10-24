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

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Discard changes" })).toBeEnabled();
  });

  it("enables Save when the editor is dirty and valid", () => {
    renderHeader(false);

    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });
});
