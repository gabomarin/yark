import { findPortConflicts } from "./port-conflicts";
import { offsetPort, type ServerProfile } from "./types";

/** Factory bases for new ASA dedicated servers (ASA / Steam common defaults). */
export const DEFAULT_GAME_PORT = 7777;
export const DEFAULT_QUERY_PORT = 27015;
export const DEFAULT_RCON_PORT = 27020;

/**
 * Keep relative spacing; same step clone uses when hunting a free triplet.
 * Private: only {@link suggestNextPortTriplet} consumes it (knip).
 */
const PORT_SUGGEST_STEP = 10;
/** Inclusive max offset from bases before suggestion gives up (#55 / clone). */
export const PORT_SUGGEST_MAX_OFFSET = 1000;

export type PortTriplet = {
  gamePort: number;
  queryPort: number;
  rconPort: number;
};

export type SuggestedPortTriplet = PortTriplet & {
  /** Offset applied to each base (0 = factory defaults unused by the fleet). */
  offset: number;
};

/**
 * Next game/query/RCON triplet that does not conflict with saved YARK profiles.
 * Starts at `bases` (offset 0), then +10, +20, … up to {@link PORT_SUGGEST_MAX_OFFSET}.
 * Returns null when the search is exhausted.
 */
export function suggestNextPortTriplet(input: {
  profiles: ReadonlyArray<
    Pick<ServerProfile, "id" | "name" | "gamePort" | "queryPort" | "rconPort">
  >;
  bases?: PortTriplet;
  /** Draft name for conflict messages; unused for matching. */
  candidateName?: string;
}): SuggestedPortTriplet | null {
  const bases = input.bases ?? {
    gamePort: DEFAULT_GAME_PORT,
    queryPort: DEFAULT_QUERY_PORT,
    rconPort: DEFAULT_RCON_PORT,
  };
  const name = input.candidateName?.trim() || "New server";

  for (let offset = 0; offset <= PORT_SUGGEST_MAX_OFFSET; offset += PORT_SUGGEST_STEP) {
    const candidate: PortTriplet = {
      gamePort: offsetPort(bases.gamePort, offset),
      queryPort: offsetPort(bases.queryPort, offset),
      rconPort: offsetPort(bases.rconPort, offset),
    };
    if (
      findPortConflicts(input.profiles, {
        ...candidate,
        name,
        id: undefined,
      }).length === 0
    ) {
      return { ...candidate, offset };
    }
  }
  return null;
}
