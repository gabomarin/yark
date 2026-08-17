import { describe, expect, it } from "vitest";
import { parseOptionalMaxPlayers } from "@features/servers/components/ServerForm/serverFormModel";

describe("parseOptionalMaxPlayers", () => {
  it("treats empty, blank, and non-numeric input as 0 (omit -WinLiveMaxPlayers)", () => {
    expect(parseOptionalMaxPlayers("")).toBe(0);
    expect(parseOptionalMaxPlayers(" ")).toBe(0);
    expect(parseOptionalMaxPlayers("abc")).toBe(0);
  });

  it("parses a slot count", () => {
    expect(parseOptionalMaxPlayers("70")).toBe(70);
    expect(parseOptionalMaxPlayers(" 9 ")).toBe(9);
  });
});
