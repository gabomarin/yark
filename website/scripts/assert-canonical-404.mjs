/**
 * Regression guard for #149: GitHub Pages needs a single root `404.html`.
 * Starlight’s injected `/404` plus `content/docs/404.md` used to conflict and
 * warn; the canonical source is `website/src/pages/404.astro`.
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const websiteRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(websiteRoot, "dist");

function fail(message) {
  console.error(`assert-canonical-404: ${message}`);
  process.exitCode = 1;
}

if (!existsSync(dist)) {
  fail(`missing dist at ${dist} — run \`npm run build\` in website/ first`);
} else {
  const html404 = join(dist, "404.html");
  const nested404 = join(dist, "404", "index.html");

  if (!existsSync(html404)) {
    fail("expected dist/404.html (GitHub Pages custom 404 artifact)");
  } else {
    console.log("assert-canonical-404: found dist/404.html");
  }

  if (existsSync(nested404)) {
    fail(
      "found dist/404/index.html — duplicate /404 from docs catch-all; keep only pages/404.astro",
    );
  }

  // Fail if content docs reintroduce a Starlight slug that collides with /404.
  const docs404 = join(websiteRoot, "src", "content", "docs", "404.md");
  const docs404Mdx = join(websiteRoot, "src", "content", "docs", "404.mdx");
  if (existsSync(docs404) || existsSync(docs404Mdx)) {
    fail(
      "src/content/docs/404.md(x) must not exist when using pages/404.astro + disable404Route",
    );
  }
}

if (process.exitCode) {
  process.exit(process.exitCode);
}
