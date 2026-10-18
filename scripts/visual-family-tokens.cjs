const assert = require("node:assert/strict");

/**
 * Assert the visual family mounted before family-specific screenshots are taken.
 * @param {import("playwright").Page} page
 * @param {"fluent" | "plasma-breeze" | "glassy"} family
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

  if (family === "glassy") {
    const scheme = await page.evaluate(() => document.documentElement.getAttribute("data-mantine-color-scheme"));
    const expectedAccent = scheme === "light" ? "#176fb3" : "#28d4ec";
    assert.equal(mounted.accent, expectedAccent, `Glassy accent is "${mounted.accent}", expected ${expectedAccent}`);
    assert.ok(mounted.panel.length > 0, "--app-color-panel is not emitted by the resolver");
    const expectedRadius = mounted.density === "compact" ? "10px" : "12px";
    assert.equal(
      mounted.radiusMd,
      expectedRadius,
      `Glassy --app-radius-md is "${mounted.radiusMd}" at ${mounted.density} density`,
    );
    const materials = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return {
        family: document.documentElement.getAttribute("data-theme-family"),
        filter: style.getPropertyValue("--app-material-chrome-filter").trim(),
        contentFilter: style.getPropertyValue("--app-material-content-filter").trim(),
        contrast: style.getPropertyValue("--app-color-accent-contrast").trim().toLowerCase(),
      };
    });
    assert.equal(materials.family, "glassy", `data-theme-family is "${materials.family}"`);
    assert.ok(materials.filter.includes("blur("), `Glassy chrome filter is "${materials.filter}"`);
    assert.ok(
      materials.contentFilter.includes("blur("),
      `Glassy content filter is "${materials.contentFilter}"`,
    );
    if (scheme === "dark") {
      assert.equal(materials.contrast, "#03151c", `Glassy Dark accent-contrast is "${materials.contrast}"`);
    }
  }

  return mounted;
}

module.exports = { assertFamilyMounted };
