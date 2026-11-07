/**
 * Best-effort chmod helpers so YARK can write GameUserSettings.ini / Game.ini
 * when the files were left read-only (external tools or older Lock INI experiments).
 */

import { chmod } from "node:fs/promises";

/** Clear read-only so YARK can write (idle save / Start sync / restore). */
export async function clearIniFilesReadOnly(paths: readonly string[]): Promise<void> {
  for (const path of paths) {
    try {
      await chmod(path, 0o666);
    } catch {
      // Missing file or unsupported chmod — ignore.
    }
  }
}
