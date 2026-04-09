import { describe, it, expect } from 'vitest';
import { groupExact, groupPerceptual } from './grouping.js';

type FingerprintEntry = { fileId: number; fingerprint: string };

describe('groupExact', () => {
  it('groups files with identical fingerprints', () => {
    const entries: FingerprintEntry[] = [
      { fileId: 1, fingerprint: 'abc' },
      { fileId: 2, fingerprint: 'abc' },
      { fileId: 3, fingerprint: 'xyz' },
    ];
    const groups = groupExact(entries);
    expect(groups).toHaveLength(1); // only 'abc' group (2+ members)
    expect(groups[0].fileIds).toEqual(expect.arrayContaining([1, 2]));
    expect(groups[0].similarityScore).toBe(100);
  });

  it('ignores unique fingerprints', () => {
    const entries: FingerprintEntry[] = [
      { fileId: 1, fingerprint: 'aaa' },
      { fileId: 2, fingerprint: 'bbb' },
    ];
    expect(groupExact(entries)).toHaveLength(0);
  });

  it('handles empty input', () => {
    expect(groupExact([])).toHaveLength(0);
  });

  it('groups three files with same fingerprint into one cluster', () => {
    const entries: FingerprintEntry[] = [
      { fileId: 1, fingerprint: 'same' },
      { fileId: 2, fingerprint: 'same' },
      { fileId: 3, fingerprint: 'same' },
    ];
    const groups = groupExact(entries);
    expect(groups).toHaveLength(1);
    expect(groups[0].fileIds).toHaveLength(3);
  });
});

describe('groupPerceptual', () => {
  it('clusters hashes within threshold', () => {
    // All zeros vs one bit difference: distance = 1
    const entries: FingerprintEntry[] = [
      { fileId: 1, fingerprint: '0000000000000000' },
      { fileId: 2, fingerprint: '0000000000000001' },
      { fileId: 3, fingerprint: 'ffffffffffffffff' }, // very different
    ];
    const groups = groupPerceptual(entries, 10);
    expect(groups).toHaveLength(1);
    expect(groups[0].fileIds).toEqual(expect.arrayContaining([1, 2]));
    expect(groups[0].fileIds).not.toContain(3);
  });

  it('ignores isolated fingerprints with no match', () => {
    const entries: FingerprintEntry[] = [
      { fileId: 1, fingerprint: '0000000000000000' },
      { fileId: 2, fingerprint: 'ffffffffffffffff' },
    ];
    expect(groupPerceptual(entries, 10)).toHaveLength(0);
  });

  it('includes similarity score below 100', () => {
    const entries: FingerprintEntry[] = [
      { fileId: 1, fingerprint: '0000000000000000' },
      { fileId: 2, fingerprint: '0000000000000003' }, // 2-bit diff
    ];
    const groups = groupPerceptual(entries, 10);
    expect(groups[0].similarityScore).toBeLessThan(100);
    expect(groups[0].similarityScore).toBeGreaterThan(90);
  });

  it('handles empty input', () => {
    expect(groupPerceptual([], 10)).toHaveLength(0);
  });

  it('respects the threshold — entries at exactly threshold are included', () => {
    // Create two hashes with exactly 10 bits different
    const a = '0000000000000000';
    const b = '00000000000003ff'; // bits 0–9 set = 10 bits
    const entries: FingerprintEntry[] = [
      { fileId: 1, fingerprint: a },
      { fileId: 2, fingerprint: b },
    ];
    expect(groupPerceptual(entries, 10)).toHaveLength(1);
    expect(groupPerceptual(entries, 9)).toHaveLength(0); // just outside threshold
  });

  it('throws when fingerprint lengths differ', () => {
    const entries: FingerprintEntry[] = [
      { fileId: 1, fingerprint: '0000000000000000' },       // 16 chars
      { fileId: 2, fingerprint: '00000000000000000000000000000000' }, // 32 chars
    ];
    expect(() => groupPerceptual(entries, 10)).toThrow('fingerprint length mismatch');
  });

  it('complete-linkage: does not chain A→B→C when A and C exceed threshold', () => {
    // A-B = 5 bits (within threshold 5)
    // B-C = 3 bits (within threshold 5)
    // A-C = 6 bits (over threshold 5)
    // Single-linkage would put all three in one group if B is the pivot.
    // Complete-linkage must reject C when adding it to cluster [A,B] because A-C > threshold.
    const entries: FingerprintEntry[] = [
      { fileId: 1, fingerprint: '0000000000000000' }, // A
      { fileId: 2, fingerprint: '00000000000000f8' }, // B — 5 bits from A (0xF8 = 1111 1000)
      { fileId: 3, fingerprint: '000000000000007e' }, // C — 3 bits from B (0x86 diff), 6 bits from A
    ];
    const groups = groupPerceptual(entries, 5);
    expect(groups).toHaveLength(1);
    expect(groups[0].fileIds).toHaveLength(2);
    // A and C must never be in the same group
    const groupWithA = groups.find((g) => g.fileIds.includes(1));
    const groupWithC = groups.find((g) => g.fileIds.includes(3));
    expect(groupWithA).not.toBe(groupWithC);
  });

  it('complete-linkage: all three in same group when all pairwise distances are within threshold', () => {
    const entries: FingerprintEntry[] = [
      { fileId: 1, fingerprint: '0000000000000000' }, // A
      { fileId: 2, fingerprint: '0000000000000001' }, // B — 1 bit from A
      { fileId: 3, fingerprint: '0000000000000003' }, // C — 1 bit from B, 2 bits from A
    ];
    // All pairwise distances ≤ 2, so complete-linkage puts them all together
    const groups = groupPerceptual(entries, 2);
    expect(groups).toHaveLength(1);
    expect(groups[0].fileIds).toHaveLength(3);
  });
});
