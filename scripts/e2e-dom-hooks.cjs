/**
 * Playwright / visual script selectors for priority `data-*` hooks (#457).
 * Values must stay in sync with feature `*TestIds.ts` (see
 * `tests/unit/dom-test-hooks-sync.test.ts`).
 */

const SERVER_CARD = "[data-server-card]";
const STEAMCMD_PATH = "[data-steamcmd-path]";

/** Card matched by `data-server-name` (exact). */
function serverCardByName(name) {
  return `${SERVER_CARD}[data-server-name="${name}"]`;
}

module.exports = {
  SERVER_CARD,
  STEAMCMD_PATH,
  serverCardByName,
};
