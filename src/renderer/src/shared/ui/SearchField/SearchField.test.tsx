import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import { SearchField } from "./SearchField";

describe("SearchField", () => {
  it("shows an in-field clear control for filter fields with text", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <AppProviders>
        <SearchField value="Island" onChange={onChange} label="Search servers" />
      </AppProviders>,
    );

    expect(screen.getByRole("textbox", { name: "Search servers" })).toHaveValue(
      "Island",
    );
    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("hides clear when empty and keeps submit magnifier without clear", () => {
    const onSubmit = vi.fn();

    const { rerender } = render(
      <AppProviders>
        <SearchField value="" onChange={vi.fn()} label="Search servers" />
      </AppProviders>,
    );
    expect(screen.queryByRole("button", { name: "Clear search" })).not.toBeInTheDocument();

    rerender(
      <AppProviders>
        <SearchField
          value="raptor"
          onChange={vi.fn()}
          label="Discover mods"
          onSubmit={onSubmit}
        />
      </AppProviders>,
    );
    expect(screen.getByRole("button", { name: "Search" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear search" })).not.toBeInTheDocument();
  });
});
