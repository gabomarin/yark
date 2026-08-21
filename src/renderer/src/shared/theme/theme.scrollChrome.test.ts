import { describe, expect, it } from "vitest";
import { createAppThemeForDensity } from "./theme";

describe("createAppThemeForDensity scroll chrome (#395)", () => {
  it("defaults ScrollArea and combobox dropdowns to type auto", () => {
    const theme = createAppThemeForDensity("comfortable");
    const components = theme.components ?? {};

    expect(components.ScrollArea?.defaultProps).toMatchObject({ type: "auto" });
    expect(components.ScrollAreaAutosize?.defaultProps).toMatchObject({
      type: "auto",
    });
    expect(components.Select?.defaultProps).toMatchObject({
      scrollAreaProps: {
        type: "auto",
        offsetScrollbars: false,
        scrollbarSize: 8,
      },
    });
    expect(components.MultiSelect?.defaultProps).toMatchObject({
      scrollAreaProps: {
        type: "auto",
        offsetScrollbars: false,
        scrollbarSize: 8,
      },
    });
  });

  it("keeps compact Select size xs with scrollAreaProps", () => {
    const theme = createAppThemeForDensity("compact");
    expect(theme.components?.Select?.defaultProps).toMatchObject({
      size: "xs",
      scrollAreaProps: {
        type: "auto",
        offsetScrollbars: false,
        scrollbarSize: 8,
      },
    });
  });
});
