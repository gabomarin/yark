import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

const pendingTimeouts = new Set<ReturnType<typeof setTimeout>>();
const nativeSetTimeout = globalThis.setTimeout.bind(globalThis);
const nativeClearTimeout = globalThis.clearTimeout.bind(globalThis);

/**
 * Track timers so afterEach can cancel Mantine Transition timeouts before
 * Vitest tears down jsdom. React 19 otherwise dispatches setState against a
 * destroyed window (unhandled "window is not defined").
 */
globalThis.setTimeout = ((
	handler: TimerHandler,
	delay?: number,
	...args: unknown[]
): ReturnType<typeof setTimeout> => {
	const id = nativeSetTimeout((...cbArgs: unknown[]) => {
		pendingTimeouts.delete(id);
		if (typeof handler === "function") {
			(handler as (...xs: unknown[]) => void)(...cbArgs);
		}
	}, delay, ...args);
	pendingTimeouts.add(id);
	return id;
}) as unknown as typeof setTimeout;

globalThis.clearTimeout = ((id?: ReturnType<typeof setTimeout>) => {
	if (id !== undefined) {
		pendingTimeouts.delete(id);
	}
	return nativeClearTimeout(id);
}) as unknown as typeof clearTimeout;

afterEach(() => {
	cleanup();
	for (const id of pendingTimeouts) {
		nativeClearTimeout(id);
	}
	pendingTimeouts.clear();
});

Object.defineProperty(window, "matchMedia", {
	writable: true,
	value: (query: string) => ({
		// Prefer reduced motion in tests so Mantine skips transition timeouts
		// (use-lock-scroll) that otherwise fire after jsdom teardown.
		matches: /prefers-reduced-motion:\s*reduce/i.test(query),
		media: query,
		onchange: null,
		addListener: () => undefined,
		removeListener: () => undefined,
		addEventListener: () => undefined,
		removeEventListener: () => undefined,
		dispatchEvent: () => false,
	}),
});

class ResizeObserverMock {
	observe(): void {}
	unobserve(): void {}
	disconnect(): void {}
}

Object.defineProperty(window, "ResizeObserver", {
	writable: true,
	value: ResizeObserverMock,
});

Object.defineProperty(Element.prototype, "scrollIntoView", {
	writable: true,
	value: () => undefined,
});

// Mantine 9 TextareaAutosize listens on document.fonts (missing in jsdom).
Object.defineProperty(document, "fonts", {
	writable: true,
	configurable: true,
	value: {
		addEventListener: () => undefined,
		removeEventListener: () => undefined,
		ready: Promise.resolve(),
	},
});

// Floating UI hides when the reference box is 0×0 (common in jsdom). Only
// patch empty rects so tests that assert real layout still see native values.
const nativeGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect(): DOMRect {
	const rect = nativeGetBoundingClientRect.call(this);
	if (rect.width > 0 || rect.height > 0) {
		return rect;
	}
	return {
		x: rect.x,
		y: rect.y,
		width: 120,
		height: 32,
		top: rect.top,
		left: rect.left,
		right: rect.left + 120,
		bottom: rect.top + 32,
		toJSON: () => ({}),
	} as DOMRect;
};
