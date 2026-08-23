import { describe, expect, it } from "vitest";
import { claimStartBusy, releaseStartBusy } from "./startBusyGuard";

describe("startBusyGuard (#390)", () => {
  it("rejects a second claim for the same server until released", () => {
    const busyRef = { current: new Set<string>() };

    expect(claimStartBusy(busyRef, "srv-1")).toBe(true);
    expect(claimStartBusy(busyRef, "srv-1")).toBe(false);
    expect(claimStartBusy(busyRef, "srv-2")).toBe(true);

    releaseStartBusy(busyRef, "srv-1");
    expect(claimStartBusy(busyRef, "srv-1")).toBe(true);
  });
});
