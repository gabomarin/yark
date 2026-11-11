import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { conflictLineResyncPlan, type ConflictChoice } from "./configurationEditorConflict";

/** Engram and loot drafts resync on their own after a conflict accept. */
export function useConflictLineHold(
  gameText: string,
  resetDrafts: (which?: "engrams" | "loot") => void,
  prepareRef: MutableRefObject<(choices: readonly ConflictChoice[]) => void>,
): { holdEngram: boolean; holdLoot: boolean } {
  const [holdEngram, setHoldEngram] = useState(false);
  const [holdLoot, setHoldLoot] = useState(false);
  const holdEngramRef = useRef(false);
  const holdLootRef = useRef(false);
  const resetRef = useRef(resetDrafts);
  useEffect(() => {
    resetRef.current = resetDrafts;
  }, [resetDrafts]);
  useEffect(() => {
    prepareRef.current = (choices) => {
      const plan = conflictLineResyncPlan(choices);
      if (plan.resetEngrams) resetRef.current("engrams");
      if (plan.resetLoot) resetRef.current("loot");
      holdEngramRef.current = plan.holdEngram;
      holdLootRef.current = plan.holdLoot;
      setHoldEngram(plan.holdEngram);
      setHoldLoot(plan.holdLoot);
    };
  }, [prepareRef]);
  useEffect(() => {
    if (!holdEngramRef.current && !holdLootRef.current) return;
    holdEngramRef.current = false;
    holdLootRef.current = false;
    setHoldEngram(false);
    setHoldLoot(false);
  }, [gameText, holdEngram, holdLoot]);
  return { holdEngram, holdLoot };
}
