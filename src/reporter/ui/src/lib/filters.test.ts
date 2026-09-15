import { describe, it, expect } from 'vitest';
import { availableStrategies, applyStrategyFilter, reconcileSelection, strategyLabel } from './filters.js';
import type { GroupWithMembers } from '../../../../types.js';

/** Only `strategy` is read, so a stub is enough. */
const group = (id: number, strategy: string) => ({ id, strategy }) as GroupWithMembers;

describe('strategyLabel', () => {
  it('maps the known strategies to readable names', () => {
    expect(strategyLabel('exactHash')).toBe('Exact match');
    expect(strategyLabel('perceptualImage')).toBe('Similar images');
    expect(strategyLabel('perceptualVideo')).toBe('Similar videos');
    expect(strategyLabel('audioFingerprint')).toBe('Audio');
    expect(strategyLabel('metadata')).toBe('Metadata');
  });

  it('passes an unknown strategy through unchanged', () => {
    expect(strategyLabel('somethingNew')).toBe('somethingNew');
    expect(strategyLabel('')).toBe('');
  });
});

describe('availableStrategies', () => {
  it('returns nothing for no groups', () => {
    expect(availableStrategies([])).toEqual([]);
  });

  it('counts groups per strategy', () => {
    const groups = [group(1, 'exactHash'), group(2, 'exactHash'), group(3, 'audioFingerprint')];
    expect(availableStrategies(groups)).toEqual([
      { strategy: 'exactHash', label: 'Exact match', count: 2 },
      { strategy: 'audioFingerprint', label: 'Audio', count: 1 },
    ]);
  });

  it('uses a fixed display order regardless of input order', () => {
    const groups = [group(1, 'metadata'), group(2, 'audioFingerprint'), group(3, 'exactHash')];
    expect(availableStrategies(groups).map((s) => s.strategy)).toEqual([
      'exactHash', 'audioFingerprint', 'metadata',
    ]);
  });

  it('omits strategies with no groups', () => {
    expect(availableStrategies([group(1, 'exactHash')]).map((s) => s.strategy)).toEqual(['exactHash']);
  });

  it('sorts unknown strategies after the known ones, alphabetically', () => {
    const groups = [group(1, 'zebra'), group(2, 'aardvark'), group(3, 'metadata')];
    expect(availableStrategies(groups).map((s) => s.strategy)).toEqual(['metadata', 'aardvark', 'zebra']);
    expect(availableStrategies(groups)[1].label).toBe('aardvark');
  });

  it('does not mutate its input', () => {
    const groups = [group(1, 'metadata'), group(2, 'exactHash')];
    availableStrategies(groups);
    expect(groups.map((g) => g.strategy)).toEqual(['metadata', 'exactHash']);
  });
});

describe('applyStrategyFilter', () => {
  const groups = [group(1, 'exactHash'), group(2, 'audioFingerprint'), group(3, 'exactHash')];

  it('keeps only groups from the selected strategies, in order', () => {
    expect(applyStrategyFilter(groups, ['exactHash']).map((g) => g.id)).toEqual([1, 3]);
  });

  it('returns everything when all strategies are selected', () => {
    expect(applyStrategyFilter(groups, ['exactHash', 'audioFingerprint']).map((g) => g.id)).toEqual([1, 2, 3]);
  });

  it('returns nothing when the selection is empty', () => {
    expect(applyStrategyFilter(groups, [])).toEqual([]);
  });

  it('returns nothing when the selection names no strategy present in the data', () => {
    expect(applyStrategyFilter(groups, ['metadata'])).toEqual([]);
  });

  it('returns a new array rather than the input', () => {
    expect(applyStrategyFilter(groups, ['exactHash', 'audioFingerprint'])).not.toBe(groups);
  });
});

describe('reconcileSelection', () => {
  const available = ['exactHash', 'audioFingerprint'];

  it('selects everything when nothing was saved', () => {
    expect(reconcileSelection(null, available)).toEqual(available);
    expect(reconcileSelection(undefined, available)).toEqual(available);
  });

  it('selects everything when the saved selection is empty', () => {
    expect(reconcileSelection([], available)).toEqual(available);
  });

  it('selects everything when the saved value is not an array', () => {
    expect(reconcileSelection('exactHash' as unknown as string[], available)).toEqual(available);
  });

  it('selects everything when the saved selection would hide all groups', () => {
    // e.g. a re-scan with different strategies than the last session.
    expect(reconcileSelection(['metadata'], available)).toEqual(available);
  });

  it('keeps a saved subset', () => {
    expect(reconcileSelection(['audioFingerprint'], available)).toEqual(['audioFingerprint']);
  });

  it('returns the intersection in available order, not saved order', () => {
    expect(reconcileSelection(['audioFingerprint', 'exactHash'], available)).toEqual(available);
  });

  it('drops saved strategies that no longer exist', () => {
    expect(reconcileSelection(['exactHash', 'metadata'], available)).toEqual(['exactHash']);
  });

  it('dedupes a saved selection', () => {
    expect(reconcileSelection(['exactHash', 'exactHash'], available)).toEqual(['exactHash']);
  });

  it('returns nothing when no strategy is available at all', () => {
    expect(reconcileSelection(['exactHash'], [])).toEqual([]);
  });
});
