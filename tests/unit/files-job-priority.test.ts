import { describe, expect, it } from "vitest";
import {
  canEnqueueFilesJobFromMenu,
  decideFilesJobEnqueue,
  filesJobEnqueueCopy,
  occupyingFilesJobForServer,
  pickOccupyingFilesJob,
  type FilesJobOccupant,
} from "@shared/files-job-priority";

const verifyQueued: FilesJobOccupant = {
  id: "v1",
  operation: "verify-files",
  status: "pending",
};
const updateQueued: FilesJobOccupant = {
  id: "u1",
  operation: "update",
  status: "pending",
};
const verifyRunning: FilesJobOccupant = {
  id: "v2",
  operation: "verify-files",
  status: "running",
};

describe("decideFilesJobEnqueue", () => {
  it("replaces a queued Verify with Update or Install", () => {
    expect(decideFilesJobEnqueue("update", verifyQueued)).toEqual({
      action: "replace",
      occupant: verifyQueued,
    });
    expect(decideFilesJobEnqueue("install-files", verifyQueued).action).toBe(
      "replace",
    );
  });

  it("does not interrupt a running job, even with a stronger incoming job", () => {
    expect(decideFilesJobEnqueue("update", verifyRunning)).toEqual({
      action: "reject-running",
      occupant: verifyRunning,
    });
  });

  it("refuses Verify while Update is already queued", () => {
    expect(decideFilesJobEnqueue("verify-files", updateQueued)).toEqual({
      action: "reject-occupied",
      occupant: updateQueued,
    });
  });

  it("treats Install and Update as the same weight", () => {
    expect(decideFilesJobEnqueue("install-files", updateQueued).action).toBe(
      "reject-occupied",
    );
    expect(decideFilesJobEnqueue("update", {
      id: "i1",
      operation: "install-files",
      status: "pending",
    }).action).toBe("reject-occupied");
  });

  it("rejects a duplicate of the same operation", () => {
    expect(decideFilesJobEnqueue("verify-files", verifyQueued).action).toBe(
      "reject-duplicate",
    );
    expect(
      decideFilesJobEnqueue("update", { ...updateQueued, status: "paused" }).action,
    ).toBe("reject-paused");
  });
});

describe("canEnqueueFilesJobFromMenu", () => {
  it("allows Update on a queued Verify, but not Verify on a queued Update", () => {
    expect(canEnqueueFilesJobFromMenu("update", verifyQueued)).toBe(true);
    expect(canEnqueueFilesJobFromMenu("verify-files", updateQueued)).toBe(false);
    expect(canEnqueueFilesJobFromMenu("update", verifyRunning)).toBe(false);
  });
});

describe("pickOccupyingFilesJob", () => {
  it("prefers a running job over a stronger queued job", () => {
    expect(pickOccupyingFilesJob([updateQueued, verifyRunning])).toEqual(
      verifyRunning,
    );
  });
});

describe("occupyingFilesJobForServer", () => {
  it("ignores leftovers that are not occupying the slot", () => {
    expect(
      occupyingFilesJobForServer(
        [
          {
            id: "cancelled",
            serverId: "srv-1",
            operation: "verify-files",
            status: "cancelled",
          },
          {
            id: "other",
            serverId: "srv-2",
            operation: "update",
            status: "pending",
          },
        ],
        "srv-1",
      ),
    ).toBeNull();
  });
});

describe("filesJobEnqueueCopy", () => {
  it("explains a queue replace without Needs attention wording", () => {
    const copy = filesJobEnqueueCopy(
      "update",
      { action: "replace", occupant: verifyQueued },
      "Island",
    );
    expect(copy.title).toBe("Downloads queue updated");
    expect(copy.message).toMatch(/Update replaced Verify.*Island/i);
  });
});
