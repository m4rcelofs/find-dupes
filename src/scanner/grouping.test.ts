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
});
