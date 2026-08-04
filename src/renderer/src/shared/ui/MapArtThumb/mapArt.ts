import theIsland from "@renderer/assets/maps/TheIsland_WP.webp";
import scorchedEarth from "@renderer/assets/maps/ScorchedEarth_WP.webp";
import theCenter from "@renderer/assets/maps/TheCenter_WP.webp";
import aberration from "@renderer/assets/maps/Aberration_WP.webp";
import extinction from "@renderer/assets/maps/Extinction_WP.webp";
import ragnarok from "@renderer/assets/maps/Ragnarok_WP.webp";
import astraeos from "@renderer/assets/maps/Astraeos_WP.webp";
import genesis from "@renderer/assets/maps/Genesis_WP.webp";
import lostColony from "@renderer/assets/maps/LostColony_WP.webp";
import valguero from "@renderer/assets/maps/Valguero_WP.webp";
import { KNOWN_MAPS } from "@shared/types";

type KnownMapId = (typeof KNOWN_MAPS)[number];

/** Bundled ASA map artwork keyed by map id (`KNOWN_MAPS`). */
const MAP_ART_BY_ID = {
  TheIsland_WP: theIsland,
  ScorchedEarth_WP: scorchedEarth,
  TheCenter_WP: theCenter,
  Aberration_WP: aberration,
  Extinction_WP: extinction,
  Ragnarok_WP: ragnarok,
  Astraeos_WP: astraeos,
  Genesis_WP: genesis,
  LostColony_WP: lostColony,
  Valguero_WP: valguero,
} as const satisfies Record<KnownMapId, string>;

/** URL for bundled map art, or `null` when unknown / missing. */
export function resolveMapArtUrl(mapId: string): string | null {
  const key = mapId.trim();
  if (key.length === 0) {
    return null;
  }
  if (!(key in MAP_ART_BY_ID)) {
    return null;
  }
  return MAP_ART_BY_ID[key as KnownMapId];
}
