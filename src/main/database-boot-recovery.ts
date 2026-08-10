import type { DatabaseSync } from "node:sqlite";
import type { MessageBoxOptions } from "electron";
import {
  DatabaseBootError,
  openDatabase,
  type OpenDatabaseOptions,
} from "../backend/infra/db/database";
import { quarantineProfileDatabase } from "../backend/infra/db/database-recovery";

export type DatabaseRecoveryChoice = "quit" | "reveal" | "reset";

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
};

/**
 * Opens the profile database; on failure runs an operator recovery loop
 * (reveal folder / quit / quarantine + fresh DB) instead of a blank boot.
 */
export async function openDatabaseWithOperatorRecovery(
  dbPath: string,
  ui: DatabaseRecoveryUi,
  deps: OpenDatabaseWithRecoveryDeps = {},
): Promise<DatabaseSync> {
  const open = deps.open ?? openDatabase;
  const quarantine = deps.quarantine ?? quarantineProfileDatabase;

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
}): DatabaseRecoveryUi {
  return {
    async promptRecovery(error) {
      const result = await deps.showMessageBox({
        type: "error",
        title: "Can't open YARK data",
        message:
          error.kind === "migrate"
            ? "YARK couldn't update its save file."
            : "YARK can't open its save file.",
        detail: [
          operatorFacingDatabaseBootReason(error),
          error.dbPath,
          "",
          "YARK can't repair this. ARK server folders on disk are fine.",
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
