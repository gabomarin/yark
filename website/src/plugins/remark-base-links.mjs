import { visit } from "unist-util-visit";

/**
 * Prepend Astro `base` to root-relative markdown/MDX links and images.
 * Starlight already prefixes sidebar/prev-next; content body links do not.
 *
 * @param {string} base Astro `base` (e.g. `/` or `/docs-preview/`)
 */
export function remarkBaseLinks(base) {
  const prefix = normalizeBase(base);
  if (prefix === "") {
    return () => {};
  }

  return () => (tree) => {
    visit(tree, (node) => {
      if (node.type !== "link" && node.type !== "image") return;
      if (typeof node.url !== "string") return;
      node.url = withBasePrefix(node.url, prefix);
    });
  };
}

function normalizeBase(base) {
  if (typeof base !== "string" || base.length === 0 || base === "/") {
    return "";
  }
  return base.endsWith("/") ? base.slice(0, -1) : base;
}

function withBasePrefix(url, prefix) {
  // Only rewrite site-root paths: /docs/... — not //cdn, http(s), mailto, #anchors.
  if (!url.startsWith("/") || url.startsWith("//")) return url;
  if (url === prefix || url.startsWith(`${prefix}/`)) return url;
  return `${prefix}${url}`;
}
