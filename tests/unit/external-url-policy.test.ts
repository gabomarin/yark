import { describe, expect, it } from "vitest";
import { isAllowedExternalUrl } from "@shared/external-url-policy";

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
