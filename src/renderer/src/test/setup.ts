import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
	cleanup();
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

// Floating UI (Menu/Select/Popover) hides when the reference has a 0×0 box.
HTMLElement.prototype.getBoundingClientRect = () =>
	({
		x: 0,
		y: 0,
		width: 120,
		height: 32,
		top: 0,
		left: 0,
		right: 120,
		bottom: 32,
		toJSON: () => ({}),
	}) as DOMRect;
