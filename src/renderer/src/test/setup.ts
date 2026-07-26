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
