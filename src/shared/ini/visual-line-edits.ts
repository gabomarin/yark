import type { NamedEngramEdit } from "./engram-named-entries";
import type { SupplyCrateEdit } from "./supply-crate-entries";

/** Named engram edits and supply-crate edits travel on one visual Save. */
export interface VisualLineEdits {
  engrams: readonly NamedEngramEdit[];
  crates: readonly SupplyCrateEdit[];
  lootBlocked: boolean;
}

export const EMPTY_LINE_EDITS: VisualLineEdits = { engrams: [], crates: [], lootBlocked: false };

export function visualLineEditsPending(edits: VisualLineEdits | undefined, engramBlocked: boolean): boolean {
  if (engramBlocked || edits === undefined) return engramBlocked;
  return edits.engrams.length > 0 || edits.crates.length > 0 || edits.lootBlocked;
}
