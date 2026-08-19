import { describe, expect, it } from "vitest";
import { workspaceHeaderControls } from "./workspaceHeaderControls";

describe("workspaceHeaderControls", () => {
  it("blocks start, enable, and restart while a files job is active", () => {
    const locked = workspaceHeaderControls({
      status: "stopped",
      enabled: true,
      filesJobActive: true,
      filesReady: true,
      hasToggleEnabled: true,
    });
    expect(locked.canStart).toBe(false);
    expect(locked.canRestart).toBe(false);
    expect(locked.canEnable).toBe(false);

    const disabledLocked = workspaceHeaderControls({
      status: "stopped",
      enabled: false,
      filesJobActive: true,
      filesReady: true,
      hasToggleEnabled: true,
    });
    expect(disabledLocked.canEnable).toBe(false);
  });

  it("allows start when stopped and ready, restart only while running", () => {
    const stopped = workspaceHeaderControls({
      status: "stopped",
      enabled: true,
      filesJobActive: false,
      filesReady: true,
      hasToggleEnabled: true,
    });
    expect(stopped.canStart).toBe(true);
    expect(stopped.canRestart).toBe(false);
    expect(stopped.canStop).toBe(false);

    const running = workspaceHeaderControls({
      status: "running",
      enabled: true,
      filesJobActive: false,
      filesReady: true,
      hasToggleEnabled: true,
    });
    expect(running.canStart).toBe(false);
    expect(running.canRestart).toBe(true);
    expect(running.canStop).toBe(true);
  });
});
