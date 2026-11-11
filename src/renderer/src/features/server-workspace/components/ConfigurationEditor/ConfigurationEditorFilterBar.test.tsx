import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import { ConfigurationEditorFilterBar } from "./ConfigurationEditorFilterBar";

function renderBar(onSortChange = vi.fn()) {
  render(
    <AppProviders>
      <ConfigurationEditorFilterBar
        search=""
        onSearchChange={vi.fn()}
        filter="all"
        onFilterChange={vi.fn()}
        categoryOptions={[{ value: "all", label: "All settings (1)" }]}
        dirty={false}
        onCollapseAll={vi.fn()}
        onExpandAll={vi.fn()}
        sort="unsorted"
        onSortChange={onSortChange}
      />
    </AppProviders>,
  );
  return onSortChange;
}

describe("ConfigurationEditorFilterBar sort", () => {
  it("shows Unsorted in the sort menu and keeps Collapse and Expand available", () => {
    renderBar();

    expect(screen.getByRole("combobox", { name: "Sort settings" })).toHaveValue("Unsorted");
    expect(screen.getByRole("button", { name: "Collapse" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Expand" })).toBeVisible();
  });

  it("explains By category on hover and reports that sort when chosen", async () => {
    const onSortChange = renderBar();
    const user = userEvent.setup();

    await user.click(screen.getByRole("combobox", { name: "Sort settings" }));
    const option = screen.getByRole("option", { name: "By category" });
    await user.hover(within(option).getByText("By category"));

    expect(await screen.findByRole("tooltip")).toHaveTextContent(/Rates and Breeding/);
    expect(screen.getByRole("tooltip")).not.toHaveTextContent(/Saving/);
    await user.click(option);

    expect(onSortChange).toHaveBeenCalledWith("asInFile");
  });

  it("reports Alphabetical when that sort is chosen", async () => {
    const onSortChange = renderBar();
    const user = userEvent.setup();

    await user.click(screen.getByRole("combobox", { name: "Sort settings" }));
    await user.click(screen.getByRole("option", { name: /Alphabetical/ }));

    expect(onSortChange).toHaveBeenCalledWith("alphabetical");
  });
});
