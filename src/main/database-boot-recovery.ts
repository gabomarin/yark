import type { DatabaseSync } from "node:sqlite";
import type { MessageBoxOptions } from "electron";
import {
  DatabaseBootError,
  openDatabase,
  type OpenDatabaseOptions,
} from "../backend/infra/db/database";
import { quarantineProfileDatabase } from "../backend/infra/db/database-recovery";
import {
  describeProfileDatabaseSnapshot,
  pickPreferredProfileDatabaseSnapshot,
  restoreProfileDatabaseFromSnapshot,
  type ProfileDatabaseSnapshotInfo,
} from "../backend/infra/db/database-snapshots";

type DatabaseRecoveryChoice = "quit" | "reveal" | "reset" | "restore";

/** Operator chose Quit; main should stop boot (process is exiting). */
export class DatabaseRecoveryAbortedError extends Error {
  constructor() {
    super("Profile database recovery aborted by operator");
    this.name = "DatabaseRecoveryAbortedError";
  }
}

export interface DatabaseRecoveryUi {
  promptRecovery(error: DatabaseBootError): Promise<DatabaseRecoveryChoice>;
  revealDatabase(dbPath: string): void;
  quitApp(): void;
}

export type OpenDatabaseWithRecoveryDeps = {
  open?: (path: string, options?: OpenDatabaseOptions) => DatabaseSync;
  quarantine?: typeof quarantineProfileDatabase;
  pickSnapshot?: (
    dbPath: string,
    kind: DatabaseBootError["kind"],
  ) => ProfileDatabaseSnapshotInfo | null;
  restoreSnapshot?: typeof restoreProfileDatabaseFromSnapshot;
};

/**
 * Opens the profile database; on failure runs an operator recovery loop
 * (restore snapshot / reveal folder / quit / quarantine + fresh DB).
 */
export async function openDatabaseWithOperatorRecovery(
  dbPath: string,
  ui: DatabaseRecoveryUi,
  deps: OpenDatabaseWithRecoveryDeps = {},
): Promise<DatabaseSync> {
  const open = deps.open ?? openDatabase;
  const quarantine = deps.quarantine ?? quarantineProfileDatabase;
  const pickSnapshot = deps.pickSnapshot ?? pickPreferredProfileDatabaseSnapshot;
  const restoreSnapshot = deps.restoreSnapshot ?? restoreProfileDatabaseFromSnapshot;

  try {
    return open(dbPath);
  } catch (firstError) {
    let error =
      firstError instanceof DatabaseBootError
        ? firstError
        : new DatabaseBootError("open", dbPath, firstError);

    for (;;) {
      const choice = await ui.promptRecovery(error);
      if (choice === "quit") {
        ui.quitApp();
        throw new DatabaseRecoveryAbortedError();
      }
      if (choice === "reveal") {
        ui.revealDatabase(dbPath);
        continue;
      }

      if (choice === "restore") {
        const preferred = pickSnapshot(dbPath, error.kind);
        if (!preferred) {
          error = new DatabaseBootError(
            error.kind,
            dbPath,
            new Error("No profile database snapshot is available to restore."),
          );
          continue;
        }
        try {
          restoreSnapshot(dbPath, preferred.path, { quarantine });
          return open(dbPath);
        } catch (retryError) {
          error =
            retryError instanceof DatabaseBootError
              ? retryError
              : new DatabaseBootError("open", dbPath, retryError);
          continue;
        }
      }

      try {
        quarantine(dbPath);
        return open(dbPath);
      } catch (retryError) {
        error =
          retryError instanceof DatabaseBootError
            ? retryError
            : new DatabaseBootError("open", dbPath, retryError);
      }
    }
  }
}

type DialogShowMessageBox = (options: MessageBoxOptions) => Promise<{ response: number }>;

/** Short reason for native dialogs (avoids multi-KB quick_check dumps). */
export function operatorFacingDatabaseBootReason(error: DatabaseBootError): string {
  const raw =
    error.cause instanceof Error
      ? error.cause.message
      : error.cause != null
        ? String(error.cause)
        : error.message;
  const compact = raw.replace(/\s+/g, " ").trim();
  if (/empty/i.test(compact)) {
    return "The database file is empty.";
  }
  if (/truncat|incomplete/i.test(compact)) {
    return "The database file is incomplete.";
  }
  if (/damaged|corrupt|malformed|integrity|quick_check/i.test(compact)) {
    const countMatch = compact.match(/(\d+)\s+integrity/i);
    if (countMatch) {
      return `The database file is damaged (${countMatch[1]} problems found).`;
    }
    return "The database file is damaged.";
  }
  if (compact.length <= 160) {
    return compact;
  }
  return `${compact.slice(0, 157)}…`;
}

export function createElectronDatabaseRecoveryUi(deps: {
  showMessageBox: DialogShowMessageBox;
  showItemInFolder: (fullPath: string) => void;
  quitApp: () => void;
  pickSnapshot?: (
    dbPath: string,
    kind: DatabaseBootError["kind"],
  ) => ProfileDatabaseSnapshotInfo | null;
}): DatabaseRecoveryUi {
  const pickSnapshot = deps.pickSnapshot ?? pickPreferredProfileDatabaseSnapshot;

  return {
    async promptRecovery(error) {
      const preferred = pickSnapshot(error.dbPath, error.kind);
      const reason = operatorFacingDatabaseBootReason(error);
      const headline =
        error.kind === "migrate"
          ? "YARK couldn't update its save file."
          : "YARK can't open its save file.";

      if (preferred) {
        const result = await deps.showMessageBox({
          type: "error",
          title: "Can't open YARK data",
          message: headline,
          detail: [
            reason,
            error.dbPath,
            "",
            `Recommended: restore ${describeProfileDatabaseSnapshot(preferred)}.`,
            "The broken file is kept beside it as *.corrupt.*. ARK server folders on disk are fine.",
            "You can also open the folder, quit, or start with an empty YARK database.",
          ].join("\n"),
          buttons: ["Restore snapshot", "Quit", "Open folder", "Start empty…"],
          defaultId: 0,
          cancelId: 1,
          noLink: true,
        });
        if (result.response === 0) return "restore";
        if (result.response === 2) return "reveal";
        if (result.response === 3) return "reset";
        return "quit";
      }

      const result = await deps.showMessageBox({
        type: "error",
        title: "Can't open YARK data",
        message: headline,
        detail: [
          reason,
          error.dbPath,
          "",
          "No recent YARK snapshot is available to restore automatically.",
          "YARK can't repair this file. ARK server folders on disk are fine.",
          "Quit, copy the file from the folder, or start with an empty YARK database.",
        ].join("\n"),
        buttons: ["Quit", "Open folder", "Start empty…"],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      });
      if (result.response === 1) return "reveal";
      if (result.response === 2) return "reset";
      return "quit";
    },

    revealDatabase(dbPath) {
      deps.showItemInFolder(dbPath);
    },

    quitApp() {
      deps.quitApp();
    },
  };
}
