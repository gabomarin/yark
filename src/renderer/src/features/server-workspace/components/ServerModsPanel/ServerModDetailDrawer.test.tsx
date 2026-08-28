import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import type { ModMetadata } from "@shared/types";
import { ServerModDetailDrawer } from "./ServerModDetailDrawer";

vi.mock("@mantine/carousel", () => {
  function CarouselRoot(props: {
    children?: React.ReactNode;
    "aria-label"?: string;
  }) {
    return <div aria-label={props["aria-label"]}>{props.children}</div>;
  }
  function Slide(props: { children?: React.ReactNode }) {
    return <div>{props.children}</div>;
  }
  CarouselRoot.Slide = Slide;
  return { Carousel: CarouselRoot };
});

const baseDetail: ModMetadata = {
  id: "928304",
  name: "Scorched Earth Remastered",
  summary: "Desert map remaster.",
  description: "Map Name: ScorchedEarth_WP\n\nLong author notes for operators.",
  thumbnailUrl: null,
  screenshots: [
    "https://cdn.example/shot-a.jpg",
    "https://cdn.example/shot-b.jpg",
  ],
  authors: ["ArkCartographers"],
  downloadCount: 1000,
  dateModified: "2026-08-12T18:40:00.000Z",
  curseforgeUrl:
    "https://www.curseforge.com/ark-survival-ascended/mods/scorched",
  slug: "scorched",
  categories: ["Maps"],
};

function renderDrawer(detail: ModMetadata | null) {
  return render(
    <AppProviders>
      <ServerModDetailDrawer
        detail={detail}
        opened={detail !== null}
        configured={false}
        enabled={false}
        busy={false}
        onClose={() => undefined}
        onOpenExternal={() => undefined}
        onToggle={() => undefined}
        onAdd={() => undefined}
        onRemove={() => undefined}
      />
    </AppProviders>,
  );
}

describe("ServerModDetailDrawer #342", () => {
  it("shows description when present", async () => {
    const user = userEvent.setup();
    renderDrawer(baseDetail);

    expect(
      screen.getByLabelText(/curseforge screenshots/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/long author notes/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /show more/i }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /screenshot 1, enlarge/i }),
    );
    expect(screen.getByText(/screenshot 1 of 2/i)).toBeInTheDocument();
  });

  it("hides screenshot chrome when the list is empty", () => {
    renderDrawer({ ...baseDetail, screenshots: [] });
    expect(screen.queryByText(/^screenshots$/i)).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(/curseforge screenshots/i),
    ).not.toBeInTheDocument();
  });

  it("hides description when absent", () => {
    renderDrawer({ ...baseDetail, description: null, screenshots: [] });
    expect(screen.queryByText(/^description$/i)).not.toBeInTheDocument();
  });
});
