import { notifications } from "@mantine/notifications";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  notifyModsAddedDisabled,
  notifyNewlyAddedMods,
  resetModAddedToastQueue,
} from "./notifyModsAddedDisabled";

describe("notifyModsAddedDisabled", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetModAddedToastQueue();
  });

  it("keeps at most two toasts and hides the oldest (#226)", () => {
    const show = vi.spyOn(notifications, "show").mockImplementation((input) =>
      String(input.id ?? "id"),
    );
    const hide = vi.spyOn(notifications, "hide").mockReturnValue("");

    notifyModsAddedDisabled({ name: "Alpha" });
    notifyModsAddedDisabled({ name: "Beta" });
    notifyModsAddedDisabled({ name: "Gamma" });

    expect(show).toHaveBeenCalledTimes(3);
    expect(hide).toHaveBeenCalledTimes(1);
    expect(hide).toHaveBeenCalledWith("mods-added-1");
    expect(show.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ id: "mods-added-1", title: "Mod Added" }),
    );
    expect(show.mock.calls[2]?.[0]).toEqual(
      expect.objectContaining({
        id: "mods-added-3",
        message: expect.stringContaining("Gamma"),
      }),
    );
  });

  it("toasts each newly added id from a batch", () => {
    const show = vi.spyOn(notifications, "show").mockImplementation((input) =>
      String(input.id ?? "id"),
    );

    notifyNewlyAddedMods(["111"], {
      configuredIds: ["111", "222", "333"],
      cache: {
        "222": { name: "Two" },
        "333": { name: "Three" },
      },
    });

    expect(show).toHaveBeenCalledTimes(2);
    expect(show.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ message: expect.stringContaining("Two") }),
    );
    expect(show.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({ message: expect.stringContaining("Three") }),
    );
  });
});
