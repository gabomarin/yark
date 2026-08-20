import type { ReactElement } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppProviders } from "./AppProviders";

function Probe(): ReactElement {
  return <div>provider-ready</div>;
}

describe("AppProviders", () => {
  it("renders children inside Mantine providers", () => {
    const { rerender, unmount } = render(
      <AppProviders density="compact">
        <Probe />
      </AppProviders>,
    );

    expect(screen.getByText("provider-ready")).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute("data-ui-density", "compact");
    expect(document.querySelector(".mantine-Notifications-root")).toHaveAttribute(
      "data-position",
      "bottom-right",
    );

    rerender(
      <AppProviders density="comfortable">
        <Probe />
      </AppProviders>,
    );
    expect(document.documentElement).toHaveAttribute("data-ui-density", "comfortable");

    unmount();
    expect(document.documentElement).not.toHaveAttribute("data-ui-density");
  });
});
