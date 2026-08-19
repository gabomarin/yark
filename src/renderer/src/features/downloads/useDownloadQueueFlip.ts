import { useLayoutEffect, useRef, type RefObject } from "react";
import { flipDeltas, shouldFlipQueueOrder } from "./downloadsFlip";

const FLIP_MS = 220;
const FLIP_FALLBACK_MS = 280;
const FLIP_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

const flipCleanup = new WeakMap<HTMLElement, () => void>();

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function measureRows(container: HTMLElement): Map<string, DOMRect> {
  const boxes = new Map<string, DOMRect>();
  for (const node of container.querySelectorAll("[data-download-row]")) {
    if (!(node instanceof HTMLElement)) continue;
    const id = node.dataset.downloadRow;
    if (id === undefined || id.length === 0) continue;
    boxes.set(id, node.getBoundingClientRect());
  }
  return boxes;
}

function findRow(container: HTMLElement, id: string): HTMLElement | null {
  for (const node of container.querySelectorAll("[data-download-row]")) {
    if (!(node instanceof HTMLElement)) continue;
    if (node.dataset.downloadRow === id) return node;
  }
  return null;
}

function playFlip(el: HTMLElement, dy: number): void {
  flipCleanup.get(el)?.();

  el.style.transition = "none";
  el.style.transform = `translateY(${dy}px)`;
  el.dataset.flip = "true";
  void el.offsetHeight;

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    window.clearTimeout(timeoutId);
    el.removeEventListener("transitionend", onEnd);
    el.style.transition = "";
    el.style.transform = "";
    delete el.dataset.flip;
    flipCleanup.delete(el);
  };
  const onEnd = (event: TransitionEvent) => {
    if (event.target !== el || event.propertyName !== "transform") return;
    finish();
  };
  const timeoutId = window.setTimeout(finish, FLIP_FALLBACK_MS);
  flipCleanup.set(el, finish);
  el.addEventListener("transitionend", onEnd);

  requestAnimationFrame(() => {
    el.style.transition = `transform ${FLIP_MS}ms ${FLIP_EASING}`;
    el.style.transform = "translateY(0)";
  });
}

export function useDownloadQueueFlip(
  containerRef: RefObject<HTMLElement | null>,
  rowIds: readonly string[],
): void {
  const previousIdsRef = useRef<string[]>([]);
  const previousBoxesRef = useRef<Map<string, DOMRect>>(new Map());
  const orderKey = rowIds.join("\0");

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (container === null) return;

    const nextIds = orderKey.length === 0 ? [] : orderKey.split("\0");
    const nextBoxes = measureRows(container);
    const previousIds = previousIdsRef.current;

    if (!prefersReducedMotion() && shouldFlipQueueOrder(previousIds, nextIds)) {
      const deltas = flipDeltas(previousBoxesRef.current, nextBoxes);
      for (const [id, dy] of deltas) {
        const el = findRow(container, id);
        if (el !== null) playFlip(el, dy);
      }
    }

    previousIdsRef.current = nextIds;
    previousBoxesRef.current = nextBoxes;
  }, [containerRef, orderKey]);
}
