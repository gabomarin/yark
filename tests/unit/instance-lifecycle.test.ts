import { describe, expect, it } from "vitest";
import {
  backingUpPercent,
  backupKindLabel,
  buildServerStopProgress,
  buildServerStoppedEventMessage,
  sameServerIds,
} from "@backend/domains/instances/instance-lifecycle";

describe("instance-lifecycle helpers", () => {
  it("formats backup labels and progress percent", () => {
    expect(backupKindLabel("world")).toBe("world save");
    expect(backupKindLabel("players")).toBe("player profiles");
    expect(backingUpPercent(0, 2)).toBe(40);
    expect(backingUpPercent(1, 2)).toBe(85);
  });

  it("compares fleet server id sets", () => {
    expect(sameServerIds([{ id: "a" }], [{ serverId: "a" } as never])).toBe(true);
    expect(sameServerIds([{ id: "a" }], [])).toBe(false);
  });

  it("builds stop progress and stopped event copy", () => {
    expect(
      buildServerStopProgress("srv-1", "quit", {
        active: true,
        phase: "saving",
        label: "Saving…",
        percent: 10,
      }).reason,
    ).toBe("quit");
    expect(
      buildServerStoppedEventMessage({
        serverName: "Island",
        exitedExternally: true,
        didBackup: true,
      }),
    ).toContain("externally");
  });
});
