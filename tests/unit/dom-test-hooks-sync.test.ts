import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import {
  SERVER_CARD_SELECTOR,
} from "../../src/renderer/src/features/servers/components/ServerCard/serverCardTestIds";
import { STEAMCMD_PATH_SELECTOR } from "../../src/renderer/src/features/settings/settingsTestIds";

const require = createRequire(import.meta.url);
const e2eHooks = require("../../scripts/e2e-dom-hooks.cjs") as {
  SERVER_CARD: string;
  STEAMCMD_PATH: string;
};

describe("dom-test-hooks sync (#457)", () => {
  it("keeps Playwright CJS selectors aligned with feature TestIds", () => {
    expect(e2eHooks.SERVER_CARD).toBe(SERVER_CARD_SELECTOR);
    expect(e2eHooks.STEAMCMD_PATH).toBe(STEAMCMD_PATH_SELECTOR);
  });
});
