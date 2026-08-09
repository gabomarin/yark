import { render, screen, act, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { AppProviders } from "@app/AppProviders";
import { ConsoleSurface } from "./ConsoleSurface";

let nextRafId = 1;
const rafCallbacks = new Map<number, FrameRequestCallback>();

async function flushRaf(): Promise<void> {
  await act(async () => {
    const pending = [...rafCallbacks.entries()];
    rafCallbacks.clear();
    for (const [, cb] of pending) {
      cb(0);
    }
  });
}

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
    nextRafId = 1;
    rafCallbacks.clear();
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      const id = nextRafId;
      nextRafId += 1;
      rafCallbacks.set(id, cb);
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      rafCallbacks.delete(id);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    rafCallbacks.clear();
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
    const metrics = { scrollHeight: 400, clientHeight: 120, scrollTop: 280 };
    mockViewportMetrics(viewport, metrics);

    metrics.scrollHeight = 800;
    rerender(
      <AppProviders>
        <ConsoleSurface text={"a\n".repeat(40)} h={120} />
      </AppProviders>,
    );

    await flushRaf();

    expect(viewport.scrollTop).toBe(800 - 120);
  });

  it("does not force scroll after the user scrolls up past the threshold", async () => {
    const { container, rerender } = render(
      <AppProviders>
        <ConsoleSurface text={"a\n".repeat(20)} h={120} stickThresholdPx={48} />
      </AppProviders>,
    );

    // Mount pin schedules a follow-up rAF pin + a programmatic-scroll release.
    await flushRaf();
    await flushRaf();

    const viewport = getViewport(container);
    mockViewportMetrics(viewport, { scrollHeight: 400, clientHeight: 120, scrollTop: 100 });

    // Mantine ScrollArea feeds onScrollPositionChange from viewport scroll.
    fireEvent.scroll(viewport);

    rerender(
      <AppProviders>
        <ConsoleSurface text={"a\n".repeat(40)} h={120} stickThresholdPx={48} />
      </AppProviders>,
    );

    await flushRaf();
    await flushRaf();

    expect(viewport.scrollTop).toBe(100);
  });
});
