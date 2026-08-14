import { describe, expect, it } from "vitest";
import {
  bundledSteamCmdUnusedNote,
  isPathUnderParent,
} from "@features/settings/settingsModel";

describe("bundledSteamCmdUnusedNote", () => {
  const bundled = "C:\\Users\\me\\AppData\\Roaming\\yark-server-manager\\steamcmd";

  it("is silent when YARK is using the bundled exe", () => {
    expect(
      bundledSteamCmdUnusedNote(bundled, `${bundled}\\steamcmd.exe`),
    ).toBeNull();
  });

  it("notes when a chosen SteamCMD lives elsewhere", () => {
    expect(
      bundledSteamCmdUnusedNote(bundled, "C:\\tools\\steamcmd\\steamcmd.exe"),
    ).toBe(
      "Not in use. YARK is using the SteamCMD you chose in Settings → SteamCMD.",
    );
  });

  it("notes when SteamCMD is not configured yet", () => {
    expect(bundledSteamCmdUnusedNote(bundled, null)).toBe(
      "Empty until you use Install SteamCMD.",
    );
  });

  it("does not treat a sibling steamcmd-other folder as bundled", () => {
    expect(
      isPathUnderParent(bundled, "C:\\Users\\me\\AppData\\Roaming\\yark-server-manager\\steamcmd-other\\steamcmd.exe"),
    ).toBe(false);
  });
});
