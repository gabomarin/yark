import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MapArtThumb } from "./MapArtThumb";

describe("MapArtThumb", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders bundled art for official maps", () => {
    render(<MapArtThumb mapId="TheIsland_WP" decorative={false} label="The Island" />);
    const img = screen.getByRole("img", { name: "The Island" });
    expect(img).toHaveAttribute("src");
    expect(img.getAttribute("src")).toMatch(/TheIsland_WP|theIsland|maps/i);
  });

  it("renders CurseForge mod logo for custom maps with mapModId (#193)", () => {
    render(
      <MapArtThumb
        mapId="Svartalfheim_WP"
        mapModId="962796"
        modThumbnailUrl="https://cdn.example/svart.png"
        decorative={false}
        label="Svartalfheim"
      />,
    );
    expect(screen.getByRole("img", { name: "Svartalfheim" })).toHaveAttribute(
      "src",
      "https://cdn.example/svart.png",
    );
  });

  it("falls back to icon when custom map has no mod logo", () => {
    const { container } = render(
      <MapArtThumb mapId="Svartalfheim_WP" mapModId="962796" modThumbnailUrl={null} />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });
});
