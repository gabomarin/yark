import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { openUnsavedLeaveModal } from "./openUnsavedLeaveModal";
import {
  describeWorkspaceLeave,
  type WorkspaceLeaveMode,
} from "./workspaceLeaveGuard";

export type LeaveGuard = (action: () => void) => void;
export type SaveHandler = () => Promise<boolean>;

/**
 * One App overlay leave guard: INI + assistant + embedded ServerForm dirty (#299).
 * Embedded ServerForm registers its own guard here — never onto App's ref directly.
 */
export function useWorkspaceLeaveGuard(
  onRegisterLeaveGuard: ((guard: LeaveGuard | null) => void) | undefined,
  onAfterContinue: () => void,
): {
  iniDirty: boolean;
  setIniDirty: (dirty: boolean) => void;
  assistantDirtyRef: MutableRefObject<boolean>;
  onProfileDirtyChange: (dirty: boolean) => void;
  registerProfileLeaveGuard: (guard: LeaveGuard | null) => void;
  registerProfileSave: (save: SaveHandler | null) => void;
  registerIniSave: (save: SaveHandler | null) => void;
  confirmLeaveIfDirty: (action: () => void, mode?: WorkspaceLeaveMode) => void;
} {
  const [iniDirty, setIniDirtyState] = useState(false);
  const iniDirtyRef = useRef(false);
  const assistantDirtyRef = useRef(false);
  const profileDirtyRef = useRef(false);
  const profileLeaveGuardRef = useRef<LeaveGuard | null>(null);
  const profileSaveRef = useRef<SaveHandler | null>(null);
  const iniSaveRef = useRef<SaveHandler | null>(null);
  const onAfterContinueRef = useRef(onAfterContinue);
  useEffect(() => {
    onAfterContinueRef.current = onAfterContinue;
  }, [onAfterContinue]);

  const setIniDirty = useCallback((dirty: boolean) => {
    iniDirtyRef.current = dirty;
    setIniDirtyState(dirty);
  }, []);

  const onProfileDirtyChange = useCallback((dirty: boolean) => {
    profileDirtyRef.current = dirty;
  }, []);

  const registerProfileLeaveGuard = useCallback((guard: LeaveGuard | null) => {
    profileLeaveGuardRef.current = guard;
    if (guard === null) {
      profileDirtyRef.current = false;
    }
  }, []);

  const registerProfileSave = useCallback((save: SaveHandler | null) => {
    profileSaveRef.current = save;
  }, []);

  const registerIniSave = useCallback((save: SaveHandler | null) => {
    iniSaveRef.current = save;
  }, []);

  const confirmLeaveIfDirty = useCallback(
    (action: () => void, mode: WorkspaceLeaveMode = "workspace") => {
      const run = () => {
        onAfterContinueRef.current();
        action();
      };
      const profileDirty = profileDirtyRef.current;
      const iniDirtyNow = iniDirtyRef.current;
      const assistantDirtyNow = mode === "workspace" ? assistantDirtyRef.current : false;
      const iniOrAssistant = iniDirtyNow || assistantDirtyNow;

      if (!profileDirty && !iniOrAssistant) {
        run();
        return;
      }

      if (profileDirty && !iniOrAssistant && profileLeaveGuardRef.current !== null) {
        profileLeaveGuardRef.current(run);
        return;
      }

      const copy = describeWorkspaceLeave({
        profileDirty,
        iniDirty: iniDirtyNow,
        assistantDirty: assistantDirtyNow,
        mode,
      });
      if (copy.kind === "clean") {
        run();
        return;
      }

      const saveThenRun = async (): Promise<boolean> => {
        if (profileDirty && profileSaveRef.current !== null) {
          const ok = await profileSaveRef.current();
          if (!ok) return false;
        }
        if (iniDirtyNow && iniSaveRef.current !== null) {
          const ok = await iniSaveRef.current();
          if (!ok) return false;
        }
        run();
        return true;
      };

      openUnsavedLeaveModal({
        copy,
        onDiscard: () => {
          iniDirtyRef.current = false;
          assistantDirtyRef.current = false;
          profileDirtyRef.current = false;
          setIniDirtyState(false);
          run();
        },
        onSave: saveThenRun,
      });
    },
    [],
  );

  useEffect(() => {
    onRegisterLeaveGuard?.(confirmLeaveIfDirty);
    return () => onRegisterLeaveGuard?.(null);
  }, [confirmLeaveIfDirty, onRegisterLeaveGuard]);

  return {
    iniDirty,
    setIniDirty,
    assistantDirtyRef,
    onProfileDirtyChange,
    registerProfileLeaveGuard,
    registerProfileSave,
    registerIniSave,
    confirmLeaveIfDirty,
  };
}
