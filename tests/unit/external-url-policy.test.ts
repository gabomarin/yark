import { describe, expect, it } from "vitest";
import {
  isAllowedExternalUrl,
  requireAllowedExternalUrl,
} from "@shared/external-url-policy";

describe("isAllowedExternalUrl", () => {
  it("allows wiki, CurseForge, and GitHub https links", () => {
    expect(
      isAllowedExternalUrl(
        "https://ark.wiki.gg/wiki/Server_configuration#Command_line_options",
      ),
    ).toBe(true);
    expect(
      isAllowedExternalUrl(
        "https://www.curseforge.com/ark-survival-ascended/mods/awesomespyglass",
      ),
    ).toBe(true);
    expect(
      isAllowedExternalUrl("https://github.com/gabomarin/yark/releases"),
    ).toBe(true);
  });

  it("rejects non-http schemes and unknown hosts", () => {
    expect(isAllowedExternalUrl("javascript:alert(1)")).toBe(false);
    expect(isAllowedExternalUrl("file:///C:/Windows/System32")).toBe(false);
    expect(isAllowedExternalUrl("https://evil.example/phish")).toBe(false);
    expect(isAllowedExternalUrl("not a url")).toBe(false);
  });

  it("rejects empty or leading-dot hosts that could fool suffix allowlists", () => {
    expect(isAllowedExternalUrl("https://.curseforge.com/mods")).toBe(false);
    expect(isAllowedExternalUrl("http://./")).toBe(false);
    expect(isAllowedExternalUrl("https://")).toBe(false);
  });

  it("allows real CurseForge subdomains", () => {
    expect(isAllowedExternalUrl("https://api.curseforge.com/v1/mods")).toBe(true);
  });
});

describe("requireAllowedExternalUrl", () => {
  it("returns legitimate GitHub release / notes URLs", () => {
    const releases = "https://github.com/gabomarin/yark/releases";
    const tag = "https://github.com/gabomarin/yark/releases/tag/v0.8.1";
    expect(requireAllowedExternalUrl(releases)).toBe(releases);
    expect(requireAllowedExternalUrl(tag)).toBe(tag);
    expect(requireAllowedExternalUrl(`  ${releases}  `)).toBe(releases);
  });

  it("rejects empty, missing, and malformed URLs without echoing them", () => {
    for (const bad of [null, undefined, "", "   ", "not a url"] as const) {
      expect(() => requireAllowedExternalUrl(bad)).toThrow(
        /No external URL is available|allowed external hosts/,
      );
    }
    expect(() =>
      requireAllowedExternalUrl("https://evil.example/phish"),
    ).toThrow("That link is not on the allowed external hosts list.");
    try {
      requireAllowedExternalUrl("https://evil.example/secret-token");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toContain("evil.example");
      expect((error as Error).message).not.toContain("secret-token");
    }
  });
});
