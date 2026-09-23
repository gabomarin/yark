import { describe, expect, it } from "vitest";
import {
  buildJoinFieldCopies,
  buildOpenCommand,
  hasJoinPassword,
  isJoinHostUsable,
  maskJoinPassword,
  normalizeJoinHost,
  type JoinInfoInput,
} from "./joinInfoModel";

function input(partial: Partial<JoinInfoInput> = {}): JoinInfoInput {
  return {
    sessionName: "Island",
    gamePort: 7777,
    queryPort: 27015,
    serverPassword: null,
    host: "",
    ...partial,
  };
}

describe("joinInfoModel", () => {
  it("trims the operator-supplied host", () => {
    expect(normalizeJoinHost("  203.0.113.5  ")).toBe("203.0.113.5");
  });

  it("accepts only a valid IPv4 host", () => {
    expect(isJoinHostUsable("203.0.113.5")).toBe(true);
    expect(isJoinHostUsable(" 192.168.1.10 ")).toBe(true);
    expect(isJoinHostUsable("")).toBe(false);
    expect(isJoinHostUsable("play.example.com")).toBe(false);
    expect(isJoinHostUsable("203.0.113.999")).toBe(false);
  });

  it("builds the open console command from a valid host", () => {
    expect(buildOpenCommand("203.0.113.5", 7777)).toBe("open 203.0.113.5:7777");
    expect(buildOpenCommand("  203.0.113.5 ", 7777)).toBe("open 203.0.113.5:7777");
    expect(buildOpenCommand("", 7777)).toBeNull();
    expect(buildOpenCommand("play.example.com", 7777)).toBeNull();
    expect(buildOpenCommand("203.0.113.5", 7777)).not.toContain("steam://");
  });

  it("detects and masks a join password", () => {
    expect(hasJoinPassword(null)).toBe(false);
    expect(hasJoinPassword("   ")).toBe(false);
    expect(hasJoinPassword("hunter2")).toBe(true);
    expect(maskJoinPassword(null)).toBe("");
    expect(maskJoinPassword("hunter2")).toBe("•".repeat(7));
    expect(maskJoinPassword("x".repeat(40))).toBe("•".repeat(12));
  });

  it("builds per-field copies", () => {
    expect(buildJoinFieldCopies(input({ serverPassword: "hunter2" }))).toEqual({
      sessionName: "Island",
      gamePort: "7777",
      queryPort: "27015",
      password: "hunter2",
    });
  });
});
