const assert = require("node:assert/strict");

/**
 * Assert the visual family mounted before family-specific screenshots are taken.
 * @param {import("playwright").Page} page
 * @param {"fluent" | "plasma-breeze"} family
 */
async function assertFamilyMounted(page, family) {
  const mounted = await page.evaluate(() => {
    const root = document.documentElement;
    const style = getComputedStyle(root);
    return {
      accent: style.getPropertyValue("--ark-blue-9").trim().toLowerCase(),
      font: style.getPropertyValue("--mantine-font-family").trim(),
      panel: style.getPropertyValue("--app-color-panel").trim(),
      radiusMd: style.getPropertyValue("--app-radius-md").trim(),
      density: root.getAttribute("data-ui-density"),
    };
  });

  if (family === "plasma-breeze") {
    assert.equal(mounted.accent, "#3daee9", `Plasma Breeze accent is "${mounted.accent}", expected #3daee9`);
    assert.ok(mounted.font.includes("Noto Sans"), `Plasma Breeze body font is "${mounted.font}", expected Noto Sans`);
    assert.ok(mounted.panel.length > 0, "--app-color-panel is not emitted by the resolver");
    const expectedRadius = mounted.density === "compact" ? "5px" : "6px";
    assert.equal(
      mounted.radiusMd,
      expectedRadius,
      `Plasma Breeze --app-radius-md is "${mounted.radiusMd}" at ${mounted.density} density`,
    );
  }

  return mounted;
}

module.exports = { assertFamilyMounted };
