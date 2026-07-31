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

  it("treats double-quit while work pending as still blocked", () => {
    const duringStop = {
      allowQuit: false,
      ...quitFlagsWhilePendingWork(),
    };
    expect(shouldPreventCloseDuringQuit(duringStop)).toBe(true);
    // Second close while the same work is in flight stays blocked.
    expect(shouldPreventCloseDuringQuit(duringStop)).toBe(true);
  });
});
