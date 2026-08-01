import { describe, expect, it } from "vitest";
import { normalizeServerStopProgress } from "@shared/types";
import {
  quitFlagsAfterCancel,
  quitFlagsWhileAskPrompt,
  quitFlagsWhilePendingWork,
  shouldPreventCloseDuringQuit,
} from "../../src/main/quit-gate";

describe("normalizeServerStopProgress", () => {
  it("defaults missing reason to user", () => {
    const normalized = normalizeServerStopProgress({
      serverId: "srv-1",
      active: true,
      phase: "saving",
      label: "Saving…",
      percent: 10,
    } as Parameters<typeof normalizeServerStopProgress>[0]);
    expect(normalized.reason).toBe("user");
    expect(normalized.active).toBe(true);
    expect(normalized.phase).toBe("saving");
  });

  it("preserves quit reason", () => {
    expect(
      normalizeServerStopProgress({
        serverId: "srv-1",
        active: true,
        phase: "waiting",
        label: "Waiting…",
        percent: 5,
        reason: "quit",
      }).reason,
    ).toBe("quit");
  });
});

describe("quit gate (#59)", () => {
  it("allows close only when allowQuit is set", () => {
    expect(
      shouldPreventCloseDuringQuit({
        allowQuit: true,
        isQuitting: true,
        hasPendingQuitWork: true,
        quitPolicyPromptInFlight: true,
      }),
    ).toBe(false);
  });

  it("prevents close during ask prompt, pending stop, or early isQuitting", () => {
    expect(
      shouldPreventCloseDuringQuit({
        allowQuit: false,
        ...quitFlagsWhileAskPrompt(),
        hasPendingQuitWork: false,
      }),
    ).toBe(true);

    expect(
      shouldPreventCloseDuringQuit({
        allowQuit: false,
        ...quitFlagsWhilePendingWork(),
      }),
    ).toBe(true);

    expect(
      shouldPreventCloseDuringQuit({
        allowQuit: false,
        isQuitting: true,
        hasPendingQuitWork: false,
        quitPolicyPromptInFlight: false,
      }),
    ).toBe(true);
  });

  it("resets flags after cancel", () => {
    expect(quitFlagsAfterCancel()).toEqual({
      allowQuit: false,
      isQuitting: false,
      hasPendingQuitWork: false,
      quitPolicyPromptInFlight: false,
    });
  });

  it("resets all quit flags after cancel (ready for a later quit)", () => {
    const afterAsk = {
      allowQuit: false,
      ...quitFlagsWhileAskPrompt(),
      hasPendingQuitWork: false,
    };
    expect(shouldPreventCloseDuringQuit(afterAsk)).toBe(true);
    const afterCancel = {
      ...afterAsk,
      ...quitFlagsAfterCancel(),
    };
    expect(shouldPreventCloseDuringQuit(afterCancel)).toBe(false);
  });

  it("resets flags after stop-before-quit failure so close is not stuck", () => {
    const duringStop = {
      allowQuit: false,
      ...quitFlagsWhilePendingWork(),
    };
    expect(shouldPreventCloseDuringQuit(duringStop)).toBe(true);
    const afterFailure = {
      ...duringStop,
      ...quitFlagsAfterCancel(),
    };
    expect(shouldPreventCloseDuringQuit(afterFailure)).toBe(false);
  });
});
