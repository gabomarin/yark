import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import type { IniSettingReference } from "../../iniModel";
import { ConfigurationEditorSettingsTable } from "./ConfigurationEditorSettingsTable";

function row(section: string, key: string, value: string): IniSettingReference {
  return {
    fileKey: "gameUserSettings",
    section,
    key,
    value,
    occurrence: 0,
    duplicateCount: 1,
  };
}

const sessionName = row("SessionSettings", "SessionName", "Island");
const xp = row("ServerSettings", "XPMultiplier", "2");
const password = row("ServerSettings", "ServerPassword", "secret");

function renderTable(sort: "unsorted" | "alphabetical", onAddSetting?: () => void) {
  render(
    <AppProviders>
      <ConfigurationEditorSettingsTable
        loading={false}
        iniFile="gameUserSettings"
        fileSections={["SessionSettings", "ServerSettings"]}
        sort={sort}
        highlightRowId={null}
        keysInSection={new Map()}
        onAddSetting={onAddSetting}
        groupedRows={[
          {
            category: "general",
            label: "General",
            rows: [password, sessionName],
          },
          {
            category: "rates",
            label: "Rates",
            rows: [xp],
          },
        ]}
        fileOrderSections={[
          { section: "SessionSettings", label: "SessionSettings", rows: [sessionName] },
          { section: "ServerSettings", label: "ServerSettings", rows: [xp, password] },
        ]}
        collapsedSections={{}}
        busy={false}
        isRowUnsaved={() => false}
        savedValueForRow={() => null}
        onToggleSection={vi.fn()}
        onSetSectionGroupsCollapsed={vi.fn()}
        onUpdateValue={vi.fn()}
        onResetRowToDefault={vi.fn()}
        onRevertRowToSaved={vi.fn()}
      />
    </AppProviders>,
  );
}

function resetOrder(): (string | null)[] {
  return screen.getAllByRole("button", { name: /^Reset / }).map((button) => button.getAttribute("aria-label"));
}

describe("ConfigurationEditorSettingsTable sort", () => {
  it("lists sections and keys in file order when unsorted", () => {
    renderTable("unsorted");

    expect(
      screen.getAllByRole("button", { expanded: true }).map((button) => button.getAttribute("data-ini-file-section")),
    ).toEqual(["SessionSettings", "ServerSettings"]);
    expect(resetOrder()).toEqual([
      "Reset SessionName to default",
      "Reset XPMultiplier to default",
      "Reset ServerPassword to default",
    ]);
  });

  it("keeps category groups and lists names from A to Z inside each group", () => {
    renderTable("alphabetical");

    expect(screen.getByRole("button", { name: /General/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /Rates/ })).toBeVisible();
    expect(screen.queryByRole("button", { name: /SessionSettings/ })).toBeNull();
    expect(resetOrder()).toEqual([
      "Reset ServerPassword to default",
      "Reset SessionName to default",
      "Reset XPMultiplier to default",
    ]);
  });

  it("adds a setting from the button above the table into the chosen section", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    renderTable("unsorted", onAdd);

    expect(screen.getAllByRole("button", { name: "Add setting" })).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Add setting" }));
    const form = document.querySelector("[data-ini-add-form]");
    expect(form).not.toBeNull();
    expect(document.querySelector("[data-ini-settings-scroll] [data-ini-add-form]")).toBeNull();
    const section = screen.getByRole("textbox", { name: "Section" });
    expect(section).toHaveValue("ServerSettings");
    await user.click(section);
    await user.click(screen.getByRole("option", { name: "SessionSettings" }));
    const name = screen.getByRole("textbox", { name: "Setting" });
    expect(
      screen.getByText("Known settings show up as you type. Any other name is added as plain text."),
    ).toBeVisible();
    await user.type(name, "CustomName");
    await user.click(screen.getByRole("button", { name: "Add setting" }));
    expect(onAdd).toHaveBeenCalledWith("SessionSettings", "CustomName", "");
    expect(screen.queryByRole("textbox", { name: "Setting" })).toBeNull();
    expect(screen.getByRole("button", { name: "Add setting" })).toBeVisible();
  });

  it("keeps the current section while the section name is only partly typed", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    renderTable("unsorted", onAdd);

    await user.click(screen.getByRole("button", { name: "Add setting" }));
    const section = screen.getByRole("textbox", { name: "Section" });
    await user.type(section, "s");
    await user.type(screen.getByRole("textbox", { name: "Setting" }), "CustomName");
    await user.click(screen.getByRole("button", { name: "Add setting" }));

    expect(onAdd).toHaveBeenCalledWith("ServerSettings", "CustomName", "");
  });

  it("adds a mod section only after that section is confirmed", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    renderTable("unsorted", onAdd);

    await user.click(screen.getByRole("button", { name: "Add setting" }));
    const section = screen.getByRole("textbox", { name: "Section" });
    await user.clear(section);
    await user.type(section, "CoolMod");
    await user.click(screen.getByRole("option", { name: 'Add section "CoolMod"' }));
    await user.type(screen.getByRole("textbox", { name: "Setting" }), "CustomName");
    await user.click(screen.getByRole("button", { name: "Add setting" }));

    expect(onAdd).toHaveBeenCalledWith("CoolMod", "CustomName", "");
  });
});
