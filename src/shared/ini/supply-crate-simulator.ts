/**
 * One seeded roll of a supply-crate override (PINI-013 / #686).
 * Chance is weight / sum of weights. This does not write the INI.
 * `bAppendItemSets` is marked incomplete because vanilla crate contents are not included.
 */

import type { SupplyCrateBody, SupplyCrateItemEntry } from "./supply-crate-entries";

interface SupplyCrateSimulationClass {
  className: string;
  appearances: number;
  meanQuantity: number;
  blueprintCount: number;
}

export interface SupplyCrateSimulation {
  incomplete: boolean;
  shortfall: boolean;
  rolls: number;
  classes: SupplyCrateSimulationClass[];
}

interface Grant {
  className: string;
  quantity: number;
  blueprints: number;
}

interface SupplyCrateOpeningItem {
  className: string;
  quantity: number;
  blueprints: number;
}

export interface SupplyCrateOpening {
  incomplete: boolean;
  shortfall: boolean;
  items: SupplyCrateOpeningItem[];
}

/** The first open for this seed. The same seed opens the same crate. */
export function openSupplyCrate(body: SupplyCrateBody, seed: number): SupplyCrateOpening {
  const once = rollOnce(body, mulberry32(seed));
  return {
    incomplete: body.append === true,
    shortfall: once.shortfall,
    items: once.grants.filter((item) => item.quantity > 0),
  };
}

export function simulateSupplyCrate(
  body: SupplyCrateBody,
  options: { seed: number; rolls: number },
): SupplyCrateSimulation {
  const rolls = Math.min(500, Math.max(1, Math.floor(options.rolls)));
  const rng = mulberry32(options.seed);
  const totals = new Map<string, { appearances: number; totalQuantity: number; blueprintCount: number }>();
  let shortfall = false;
  for (let roll = 0; roll < rolls; roll += 1) {
    const once = rollOnce(body, rng);
    if (once.shortfall) shortfall = true;
    for (const grant of once.grants) {
      const current = totals.get(grant.className) ?? { appearances: 0, totalQuantity: 0, blueprintCount: 0 };
      current.appearances += 1;
      current.totalQuantity += grant.quantity;
      current.blueprintCount += grant.blueprints;
      totals.set(grant.className, current);
    }
  }
  const classes = [...totals.entries()]
    .map(([className, total]) => ({
      className,
      appearances: total.appearances,
      meanQuantity: total.appearances === 0 ? 0 : total.totalQuantity / total.appearances,
      blueprintCount: total.blueprintCount,
    }))
    .sort((left, right) => right.appearances - left.appearances || left.className.localeCompare(right.className));
  return { incomplete: body.append === true, shortfall, rolls, classes };
}

/** True when a set-count or item-count power is not an even chance. The roll does not apply that power. */
export function supplyCrateRollIgnoresPower(body: SupplyCrateBody): boolean {
  return !uniformPower(body.numItemSetsPower) || body.sets.some((set) => !uniformPower(set.numItemsPower));
}

function uniformPower(value: string | null): boolean {
  if (value === null || value.trim().length === 0) return true;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric === 1;
}

function rollOnce(body: SupplyCrateBody, rng: () => number): { grants: Grant[]; shortfall: boolean } {
  const grants: Grant[] = [];
  let shortfall = false;
  const setCount = rollInt(rng, countOr(body.minSets, 1), countOr(body.maxSets, 1));
  const usedSets = new Set<number>();
  const usedEntries = new Map<number, Set<number>>();
  for (let index = 0; index < setCount; index += 1) {
    const pool = body.sets
      .map((set, setIndex) => ({ setIndex, weight: positive(set.weight) }))
      .filter((item) => item.weight > 0 && !(body.setsWithoutReplacement === true && usedSets.has(item.setIndex)));
    const picked = pickWeighted(
      rng,
      pool.map((item) => item.weight),
    );
    if (picked < 0) {
      shortfall = true;
      break;
    }
    const setIndex = pool[picked]?.setIndex ?? -1;
    const set = body.sets[setIndex];
    if (set === undefined) {
      shortfall = true;
      break;
    }
    if (body.setsWithoutReplacement === true) usedSets.add(setIndex);
    const itemCount = rollInt(rng, countOr(set.minItems, 1), countOr(set.maxItems, 1));
    const chosen = usedEntries.get(setIndex) ?? new Set<number>();
    for (let itemIndex = 0; itemIndex < itemCount; itemIndex += 1) {
      const entries = set.entries
        .map((entry, entryIndex) => ({ entryIndex, entry, weight: positive(entry.weight) }))
        .filter(
          (item) =>
            item.weight > 0 &&
            item.entry.classes.some((className) => className.trim().length > 0) &&
            !(set.itemsWithoutReplacement === true && chosen.has(item.entryIndex)),
        );
      const entryPick = pickWeighted(
        rng,
        entries.map((item) => item.weight),
      );
      if (entryPick < 0) {
        shortfall = true;
        break;
      }
      const selected = entries[entryPick];
      if (selected === undefined) {
        shortfall = true;
        break;
      }
      if (set.itemsWithoutReplacement === true) {
        chosen.add(selected.entryIndex);
        usedEntries.set(setIndex, chosen);
      }
      grants.push(...resolveEntry(selected.entry, rng));
    }
  }
  return { grants, shortfall };
}

function resolveEntry(entry: SupplyCrateItemEntry, rng: () => number): Grant[] {
  const classes = entry.classes.map((className) => className.trim()).filter((className) => className.length > 0);
  if (classes.length === 0) return [];
  const quantity = rollInt(rng, quantityBound(entry, "min"), quantityBound(entry, "max"));
  if (quantity <= 0) return [];
  const weights =
    entry.classWeights.length === classes.length
      ? entry.classWeights.map((weight) => positive(weight))
      : classes.map(() => 1);
  const force = entry.forceBlueprint === true;
  const chance = entry.blueprintChance.trim().length === 0 ? 0 : Number(entry.blueprintChance);
  if (classes.length === 1) {
    const className = classes[0] ?? "";
    const blueprint = force || (Number.isFinite(chance) && rng() < chance);
    return [{ className, quantity, blueprints: blueprint ? quantity : 0 }];
  }
  const bag = new Map<string, Grant>();
  for (let unit = 0; unit < quantity; unit += 1) {
    const picked = pickWeighted(rng, weights);
    const className = classes[picked] ?? classes[0] ?? "";
    const blueprint = force || (Number.isFinite(chance) && rng() < chance);
    const current = bag.get(className) ?? { className, quantity: 0, blueprints: 0 };
    current.quantity += 1;
    if (blueprint) current.blueprints += 1;
    bag.set(className, current);
  }
  return [...bag.values()];
}

function quantityBound(entry: SupplyCrateItemEntry, side: "min" | "max"): number {
  const min = entry.minQuantity.trim().length === 0 ? null : Number(entry.minQuantity);
  const max = entry.maxQuantity.trim().length === 0 ? null : Number(entry.maxQuantity);
  const low = min ?? max ?? 0;
  const high = max ?? min ?? 0;
  return side === "min" ? low : high;
}

function countOr(value: string, fallback: number): number {
  const trimmed = value.trim();
  if (trimmed.length === 0) return fallback;
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function positive(value: string): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function rollInt(rng: () => number, min: number, max: number): number {
  const low = Math.max(0, Math.round(Math.min(min, max)));
  const high = Math.max(0, Math.round(Math.max(min, max)));
  if (high <= low) return low;
  return low + Math.floor(rng() * (high - low + 1));
}

function pickWeighted(rng: () => number, weights: readonly number[]): number {
  let total = 0;
  for (const weight of weights) total += weight;
  if (!(total > 0)) return -1;
  let roll = rng() * total;
  for (let index = 0; index < weights.length; index += 1) {
    roll -= weights[index] ?? 0;
    if (roll < 0) return index;
  }
  return weights.length - 1;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
