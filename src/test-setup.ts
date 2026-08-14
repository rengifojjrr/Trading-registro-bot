import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom implements neither of these, and Radix primitives (tooltip,
// select, switch) reach for them during layout. A no-op stub is enough:
// the tests here assert on rendered output and interaction, not on
// measured geometry -- and real geometry is covered by the Playwright pass
// against an actual browser.
if (!("ResizeObserver" in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (!("DOMRect" in globalThis)) {
  globalThis.DOMRect = class {
    constructor(
      public x = 0,
      public y = 0,
      public width = 0,
      public height = 0,
    ) {}
    get top() {
      return this.y;
    }
    get left() {
      return this.x;
    }
    get right() {
      return this.x + this.width;
    }
    get bottom() {
      return this.y + this.height;
    }
    static fromRect(rect?: DOMRectInit) {
      return new DOMRect(rect?.x, rect?.y, rect?.width, rect?.height);
    }
    toJSON() {
      return { ...this };
    }
  } as unknown as typeof DOMRect;
}

// Pointer capture and scrollIntoView are likewise absent from jsdom, and
// Radix's Select calls them while opening its listbox -- without these,
// clicking a <Select> throws before any option is ever rendered.
if (typeof Element !== "undefined") {
  const proto = Element.prototype as unknown as Record<string, unknown>;
  if (!proto.hasPointerCapture) proto.hasPointerCapture = () => false;
  if (!proto.setPointerCapture) proto.setPointerCapture = () => {};
  if (!proto.releasePointerCapture) proto.releasePointerCapture = () => {};
  if (!proto.scrollIntoView) proto.scrollIntoView = () => {};
}

// Without this every rendered component stays in the document across
// tests, so a getByText that should match one node starts matching several
// and tests fail for reasons unrelated to what they're checking.
afterEach(() => {
  cleanup();
});
