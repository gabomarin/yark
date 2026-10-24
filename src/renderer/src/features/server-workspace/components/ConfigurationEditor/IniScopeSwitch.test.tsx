import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import { IniFileSegmented } from "@ui/IniFileSegmented/IniFileSegmented";
import { EngramPaneSwitch, GameIniViewSwitch } from "./IniScopeSwitch";

describe("unsaved view dots", () => {
  it("marks Engrams while Settings is open", () => {
    render(
      <AppProviders>
        <GameIniViewSwitch value="settings" settingsUnsaved engramsUnsaved onChange={vi.fn()} />
      </AppProviders>,
    );

    expect(screen.getByRole("radio", { name: "Settings" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Engrams Unsaved changes" })).toBeVisible();
  });

  it("marks Overrides while Points per level is open", () => {
    render(
      <AppProviders>
        <EngramPaneSwitch value="points" overridesUnsaved pointsUnsaved onChange={vi.fn()} />
      </AppProviders>,
    );

    expect(screen.getByRole("radio", { name: "Points per level" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Overrides Unsaved changes" })).toBeVisible();
  });

  it("marks Game.ini while GameUserSettings.ini is open", () => {
    render(
      <AppProviders>
        <IniFileSegmented
          value="gameUserSettings"
          onChange={vi.fn()}
          pending={{ game: true, gameUserSettings: true }}
        />
      </AppProviders>,
    );

    expect(screen.getByRole("radio", { name: "GameUserSettings.ini" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Game.ini Unsaved changes" })).toBeVisible();
  });
});
