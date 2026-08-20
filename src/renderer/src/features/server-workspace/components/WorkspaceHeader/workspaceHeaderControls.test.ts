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

  it("treats a missing status as stopped", () => {
    const controls = workspaceHeaderControls({
      status: undefined,
      enabled: true,
      filesJobActive: false,
      filesReady: true,
      hasToggleEnabled: true,
    });
    expect(controls.canStart).toBe(true);
    expect(controls.canStop).toBe(false);
    expect(controls.canRestart).toBe(false);
  });

  it("does not offer Enable when the toggle handler is absent", () => {
    const controls = workspaceHeaderControls({
      status: "stopped",
      enabled: false,
      filesJobActive: false,
      filesReady: true,
      hasToggleEnabled: false,
    });
    expect(controls.canEnable).toBe(false);
    expect(controls.canStart).toBe(false);
  });

  it("blocks Start and Restart while startBusy (#390)", () => {
    const starting = workspaceHeaderControls({
      status: "stopped",
      enabled: true,
      filesJobActive: false,
      filesReady: true,
      hasToggleEnabled: true,
      startBusy: true,
    });
    expect(starting.canStart).toBe(false);
    expect(starting.canRestart).toBe(false);

    const restarting = workspaceHeaderControls({
      status: "running",
      enabled: true,
      filesJobActive: false,
      filesReady: true,
      hasToggleEnabled: true,
      startBusy: true,
    });
    expect(restarting.canStart).toBe(false);
    expect(restarting.canRestart).toBe(false);
    expect(restarting.canStop).toBe(true);
  });
});
