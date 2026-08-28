import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import { ModDetailDescription } from "./ModDetailDescription";

function renderDescription(text: string) {
  return render(
    <AppProviders>
      <ModDetailDescription text={text} />
    </AppProviders>,
  );
}

describe("ModDetailDescription", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("decodes HTML entities from CurseForge stripped text", () => {
    renderDescription(
      "Title\n&lt;&lt;-------------------------------------------------------------------------------------------------------------&gt;&gt;",
    );
    expect(screen.getByText(/<<.*>>/)).toBeInTheDocument();
    expect(screen.queryByText(/&lt;/)).not.toBeInTheDocument();
  });

  it("shows expand only when clamped text overflows", async () => {
    const scrollHeight = vi.spyOn(HTMLElement.prototype, "scrollHeight", "get");
    const clientHeight = vi.spyOn(HTMLElement.prototype, "clientHeight", "get");

    scrollHeight.mockReturnValue(80);
    clientHeight.mockReturnValue(80);
    renderDescription("Short line.");
    expect(
      screen.queryByRole("button", { name: /show more/i }),
    ).not.toBeInTheDocument();

    scrollHeight.mockReturnValue(240);
    clientHeight.mockReturnValue(80);
    const user = userEvent.setup();
    renderDescription(
      Array.from({ length: 30 }, (_, index) => `Line ${index + 1}.`).join("\n"),
    );

    const showMore = screen.getByRole("button", { name: /show more/i });
    expect(showMore).toBeInTheDocument();
    await user.click(showMore);
    expect(
      screen.getByRole("button", { name: /show less/i }),
    ).toBeInTheDocument();
  });
});
