import { describe, expect, it } from "vitest";
import { decodeHtmlEntities } from "../../src/shared/decode-html-entities";

describe("decodeHtmlEntities", () => {
  it("decodes CurseForge decorative angle brackets", () => {
    const encoded =
      "The Bellowing Behemoth, Brachiosaurus!\n&lt;&lt;-------------------------------------------------------------------------------------------------------------&gt;&gt;";
    const decoded = decodeHtmlEntities(encoded);
    expect(decoded).toContain("The Bellowing Behemoth, Brachiosaurus!");
    expect(decoded).toContain("<<");
    expect(decoded).toContain(">>");
    expect(decoded).not.toContain("&lt;");
    expect(decoded).not.toContain("&gt;");
  });

  it("decodes common named entities", () => {
    expect(decodeHtmlEntities("a &amp; b &quot;c&quot;")).toBe('a & b "c"');
  });

  it("leaves plain text unchanged", () => {
    expect(decodeHtmlEntities("Map Name: Amissa_WP")).toBe("Map Name: Amissa_WP");
  });

  it("decodes superscript and typography entities from map descriptions", () => {
    expect(decodeHtmlEntities("144km&sup2; landscape full of mysteries")).toBe(
      "144km² landscape full of mysteries",
    );
    expect(decodeHtmlEntities("Fimbulwinter &mdash; random event")).toBe(
      "Fimbulwinter — random event",
    );
  });
});
