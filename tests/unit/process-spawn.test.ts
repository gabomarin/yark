import { describe, expect, it } from "vitest";
import {
  argsIncludeConsoleFlag,
  argsIncludeLogFlag,
  ensureLaunchLogFlags,
} from "@backend/infra/process/process-spawn";

describe("process-spawn helpers", () => {
  it("detects log and console flags", () => {
    expect(argsIncludeLogFlag(["-log"])).toBe(true);
    expect(argsIncludeConsoleFlag(["-console"])).toBe(true);
  });

  it("adds missing launch flags", () => {
    expect(ensureLaunchLogFlags(["?Map"], true)).toEqual([
      "?Map",
      "-console",
      "-log",
    ]);
    expect(ensureLaunchLogFlags(["-log"], false)).toEqual(["-log"]);
  });
});
