import type { GroupWithMembers } from '../../../../types.js';

export type StrategyOption = { strategy: string; label: string; count: number };

const LABELS: Record<string, string> = {
  exactHash: 'Exact match',
  perceptualImage: 'Similar images',
  perceptualVideo: 'Similar videos',
  audioFingerprint: 'Audio',
  metadata: 'Metadata',
};

/** Fixed display order, so the filter bar does not reshuffle as counts change. */
const ORDER = ['exactHash', 'perceptualImage', 'perceptualVideo', 'audioFingerprint', 'metadata'];

const rank = (strategy: string) => {
  const i = ORDER.indexOf(strategy);
  return i === -1 ? ORDER.length : i;
};

export const strategyLabel = (strategy: string): string => LABELS[strategy] ?? strategy;

/**
 * The strategies actually present in `groups`, with their group counts.
 *
 * Always call this with the unfiltered list: counts have to stay stable while filtering,
 * or each one would collapse to zero the moment its box is unchecked.
 */
export const availableStrategies = (groups: readonly GroupWithMembers[]): StrategyOption[] => {
  const counts = new Map<string, number>();
  for (const g of groups) counts.set(g.strategy, (counts.get(g.strategy) ?? 0) + 1);
  return [...counts.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([strategy, count]) => ({ strategy, label: strategyLabel(strategy), count }));
};

/** Client-side review filter. An empty selection means nothing is shown. */
export const applyStrategyFilter = (
  groups: readonly GroupWithMembers[],
  selected: readonly string[],
): GroupWithMembers[] => groups.filter((g) => selected.includes(g.strategy));

/**
 * Intersects a persisted selection with what the current database actually offers,
 * returned in `available` order so the result is deterministic.
 *
 * Falls back to everything when the saved value is missing, unusable, or would hide every
 * group — a selection saved before a re-scan should not present an empty screen. This
 * applies at load only; unchecking every box during a session is a legitimate state.
 */
export const reconcileSelection = (
  saved: readonly string[] | null | undefined,
  available: readonly string[],
): string[] => {
  const all = [...available];
  if (all.length === 0) return [];
  if (!Array.isArray(saved)) return all;
  const savedSet = new Set(saved);
  const kept = all.filter((s) => savedSet.has(s));
  return kept.length > 0 ? kept : all;
};
