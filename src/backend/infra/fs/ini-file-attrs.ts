/**
 * Best-effort chmod helpers so YARK can write GameUserSettings.ini / Game.ini
 * when the files were left read-only (external tools or older Lock INI experiments).
 */

import { chmod, stat } from "node:fs/promises";

/** Clear owner write bit only so YARK can write (idle save / Start sync / restore). */
export async function clearIniFilesReadOnly(paths: readonly string[]): Promise<void> {
  for (const path of paths) {
    try {
      const mode = (await stat(path)).mode;
      await chmod(path, mode | 0o200);
    } catch {
      // Missing file or unsupported chmod — ignore.
    }
  }
}
