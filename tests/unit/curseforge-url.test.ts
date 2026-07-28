import { describe, expect, it } from "vitest";
import {
  canonicalCurseForgeAsaModUrl,
  curseForgeAsaSlugFromUrl,
  getCurseForgeAsaModUrlError,
} from "@shared/curseforge-url";

describe("CurseForge ASA mod URLs", () => {
  it("accepts and canonicalizes a mod detail URL", () => {
    const input =
      "https://curseforge.com/ark-survival-ascended/mods/awesomespyglass/";
    expect(getCurseForgeAsaModUrlError(input)).toBeNull();
    expect(curseForgeAsaSlugFromUrl(input)).toBe("awesomespyglass");
    expect(canonicalCurseForgeAsaModUrl(input)).toBe(
      "https://www.curseforge.com/ark-survival-ascended/mods/awesomespyglass",
    );
  });

  it.each([
    ["", "Enter a CurseForge mod URL."],
    ["not-a-url", "Enter a valid URL, including https://."],
    ["http://curseforge.com/ark-survival-ascended/mods/test", "must use https"],
    ["https://example.com/ark-survival-ascended/mods/test", "curseforge.com"],
    ["https://curseforge.com/minecraft/mc-mods/test", "Ark: Survival Ascended"],
  ])("rejects %j", (input, expected) => {
    expect(getCurseForgeAsaModUrlError(input)).toContain(expected);
  });
});
