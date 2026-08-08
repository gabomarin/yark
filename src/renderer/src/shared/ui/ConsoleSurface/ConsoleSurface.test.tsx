import { render, screen, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { AppProviders } from "@app/AppProviders";
import { ConsoleSurface } from "./ConsoleSurface";

function mockViewportMetrics(
  node: HTMLElement,
  metrics: { scrollHeight: number; clientHeight: number; scrollTop?: number },
): void {
  Object.defineProperty(node, "scrollHeight", {
    configurable: true,
    get: () => metrics.scrollHeight,
  });
  Object.defineProperty(node, "clientHeight", {
    configurable: true,
    get: () => metrics.clientHeight,
  });
  let top = metrics.scrollTop ?? 0;
  Object.defineProperty(node, "scrollTop", {
    configurable: true,
    get: () => top,
    set: (value: number) => {
      top = value;
    },
  });
}

function getViewport(container: HTMLElement): HTMLElement {
  const viewport = container.querySelector("[data-scrollbars]");
  if (!(viewport instanceof HTMLElement)) {
    throw new Error("ScrollArea viewport not found");
  }
  return viewport;
}

describe("ConsoleSurface", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "requestAnimationFrame",
      (cb: FrameRequestCallback) => window.setTimeout(() => cb(0), 0) as unknown as number,
    );
    vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders plain console text", () => {
    render(
      <AppProviders>
        <ConsoleSurface text="line one\nline two" h={180} />
      </AppProviders>,
    );

    expect(screen.getByText(/line one/)).toBeInTheDocument();
    expect(screen.getByText(/line two/)).toBeInTheDocument();
  });

  it("sticks to bottom when text grows while sticky", async () => {
    const { container, rerender } = render(
      <AppProviders>
        <ConsoleSurface text={"a\n".repeat(20)} h={120} />
      </AppProviders>,
    );

    const viewport = getViewport(container);
    mockViewportMetrics(viewport, { scrollHeight: 400, clientHeight: 120, scrollTop: 280 });

    rerender(
      <AppProviders>
        <ConsoleSurface text={"a\n".repeat(40)} h={120} />
      </AppProviders>,
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(viewport.scrollTop).toBe(400);
  });

  it("does not force scroll after the user scrolls up past the threshold", async () => {
    const { container, rerender } = render(
      <AppProviders>
        <ConsoleSurface text={"a\n".repeat(20)} h={120} stickThresholdPx={48} />
      </AppProviders>,
    );

    // Let the mount pin + requestAnimationFrame guard clear.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const viewport = getViewport(container);
    mockViewportMetrics(viewport, { scrollHeight: 400, clientHeight: 120, scrollTop: 100 });

    // Simulate user scroll away from bottom (Mantine onScrollPositionChange path).
    viewport.dispatchEvent(new Event("scroll", { bubbles: true }));

    rerender(
      <AppProviders>
        <ConsoleSurface text={"a\n".repeat(40)} h={120} stickThresholdPx={48} />
      </AppProviders>,
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(viewport.scrollTop).toBe(100);
  });
});
