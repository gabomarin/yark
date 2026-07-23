import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppProviders } from "./AppProviders";

function Probe(): JSX.Element {
  return <div>provider-ready</div>;
}

describe("AppProviders", () => {
  it("renders children inside Mantine providers", () => {
    render(
      <AppProviders>
        <Probe />
      </AppProviders>,
    );

    expect(screen.getByText("provider-ready")).toBeInTheDocument();
  });
});