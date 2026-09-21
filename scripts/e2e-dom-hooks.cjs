/**
 * Playwright / visual script selectors for priority `data-*` hooks (#457).
 * Values must stay in sync with feature `*TestIds.ts` (see
 * `tests/unit/dom-test-hooks-sync.test.ts`).
 */

const assert = require("node:assert/strict");

const SERVER_CARD = "[data-server-card]";
const STEAMCMD_PATH = "[data-steamcmd-path]";

/** Card matched by `data-server-name` (exact). */
function serverCardByName(name) {
  return `${SERVER_CARD}[data-server-name="${name}"]`;
}

/**
 * Clicks a Mantine Switch through a Playwright locator and reports what its knob did.
 *
 * Mantine's markup (`.mantine-Switch-thumb`) and the property it animates are internals, and
 * this app animates `transform` (src/renderer/src/styles/globals.css), so the coupling lives
 * here instead of being copied into every script that checks a switch.
 */
async function probeSwitchMotion(locator) {
  return locator.evaluate((input) => {
    input.scrollIntoView({ block: "center", inline: "center" });
    const before = input.checked;
    const thumbBefore = input.parentElement?.querySelector(".mantine-Switch-thumb");
    input.click();
    const thumbAfter = input.parentElement?.querySelector(".mantine-Switch-thumb");
    return {
      changed: input.checked !== before,
      sameNode: thumbBefore === thumbAfter,
      connected: thumbBefore?.isConnected ?? false,
      // Reading the computed style first forces the style flush, so the animation sample
      // lands on the running transition rather than the frame before it started.
      transitionProperty: thumbBefore ? getComputedStyle(thumbBefore).transitionProperty : "",
      animationCount: thumbBefore ? thumbBefore.getAnimations().length : 0,
    };
  });
}

/** Asserts a switch actually toggled and animated, naming the part that failed. */
function assertSwitchMotion(motion, what) {
  assert.ok(motion, `${what}: the switch thumb is not in the DOM - did Mantine's markup change?`);
  assert.equal(motion.changed, true, `${what}: the switch did not toggle`);
  assert.equal(motion.sameNode, true, `${what}: the thumb was replaced instead of kept mounted`);
  assert.equal(motion.connected, true, `${what}: the thumb left the document while toggling`);
  assert.ok(motion.animationCount > 0, `${what}: no transition was running on the thumb`);
  assert.equal(
    motion.transitionProperty,
    "transform",
    `${what}: the thumb animates "${motion.transitionProperty}", not transform`,
  );
}

module.exports = {
  SERVER_CARD,
  STEAMCMD_PATH,
  serverCardByName,
  probeSwitchMotion,
  assertSwitchMotion,
};
