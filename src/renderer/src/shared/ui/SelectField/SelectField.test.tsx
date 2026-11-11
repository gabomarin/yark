import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppProviders } from "@app/AppProviders";
import { SelectField } from "./SelectField";
import classes from "./SelectField.module.css";

describe("SelectField", () => {
  it("keeps caller classNames and still applies the leading-icon section class", () => {
    const { container } = render(
      <AppProviders>
        <SelectField
          aria-label="Sort"
          data={[{ value: "unsorted", label: "Unsorted" }]}
          value="unsorted"
          onChange={() => undefined}
          classNames={{ input: "caller-input", section: "caller-section" }}
        />
      </AppProviders>,
    );

    expect(container.querySelector(".caller-input")).not.toBeNull();
    const section = container.querySelector(`.${classes.section}`);
    expect(section).not.toBeNull();
    expect(section?.className).toContain("caller-section");
  });
});
