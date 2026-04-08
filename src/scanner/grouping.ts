import { hammingToSimilarity } from '../strategies/perceptualImage.js';

// Convert a hex fingerprint to a Uint32Array once, so the O(n²) loop uses
// fast integer arithmetic instead of repeated BigInt string conversions.
const hexToUint32Array = (hex: string): Uint32Array => {
  const arr = new Uint32Array(hex.length / 8);
  for (let i = 0; i < arr.length; i++) {
    arr[i] = parseInt(hex.slice(i * 8, i * 8 + 8), 16);
  }
  return arr;
};

const hammingDistanceFast = (a: Uint32Array, b: Uint32Array): number => {
  let count = 0;
  for (let i = 0; i < a.length; i++) {
    let x = (a[i] ^ b[i]) >>> 0;
    while (x) { x &= x - 1; count++; }
  }
  return count;
};

type FingerprintEntry = { fileId: number; fingerprint: string };

export type MatchCluster = {
  representativeFingerprint: string;
  similarityScore: number;
  fileIds: number[];
};

/**
 * Groups files with identical fingerprints. O(n) via Map.
 * Only emits groups with 2+ members — singletons are not duplicates.
 * Similarity score is always 100.
 */
export const groupExact = (entries: FingerprintEntry[]): MatchCluster[] => {
  const byFingerprint = new Map<string, number[]>();
  for (const { fileId, fingerprint } of entries) {
    const existing = byFingerprint.get(fingerprint) ?? [];
    existing.push(fileId);
    byFingerprint.set(fingerprint, existing);
  }

  const clusters: MatchCluster[] = [];
  for (const [fingerprint, fileIds] of byFingerprint) {
    if (fileIds.length >= 2) {
      clusters.push({ representativeFingerprint: fingerprint, similarityScore: 100, fileIds });
    }
  }
  return clusters;
};

/**
 * Clusters files whose fingerprints are within `threshold` Hamming distance of each other.
 *
 * Algorithm — greedy O(n²) pivot scan:
 * 1. Iterate entries in order; skip already-assigned ones.
 * 2. Treat the current entry as a pivot; add any unassigned entry within `threshold` to its cluster.
 * 3. If the cluster has 2+ members, emit it and mark all members assigned.
 *
 * Not a global optimum — a file close to two pivots goes to the first one encountered.
 * Fast and produces useful results in practice, since true near-duplicates cluster tightly.
 *
 * Throws if fingerprint lengths are inconsistent — this indicates a strategy bug
 * (mixed hash sizes from different algorithm versions).
 *
 * Similarity score is derived from the minimum Hamming distance in the cluster (closest pair),
 * giving the most conservative figure for the group.
 */
export const groupPerceptual = (entries: FingerprintEntry[], threshold: number): MatchCluster[] => {
  if (entries.length === 0) return [];

  // Validate all fingerprints have the same length to avoid hammingDistance throwing
  const expectedLen = entries[0].fingerprint.length;
  const mismatch = entries.find((e) => e.fingerprint.length !== expectedLen);
  if (mismatch) {
    throw new Error(
      `groupPerceptual: fingerprint length mismatch — expected ${expectedLen}, got ${mismatch.fingerprint.length} for fileId ${mismatch.fileId}`,
    );
  }

  // Pre-convert all fingerprints once — avoids O(n²) BigInt string conversions.
  const uint32s = entries.map((e) => hexToUint32Array(e.fingerprint));

  const assigned = new Set<number>();
  const clusters: MatchCluster[] = [];

  for (let i = 0; i < entries.length; i++) {
    if (assigned.has(entries[i].fileId)) continue;

    const cluster: number[] = [entries[i].fileId];
    let minDistance = Infinity;

    for (let j = i + 1; j < entries.length; j++) {
      if (assigned.has(entries[j].fileId)) continue;
      const dist = hammingDistanceFast(uint32s[i], uint32s[j]);
      if (dist <= threshold) {
        cluster.push(entries[j].fileId);
        assigned.add(entries[j].fileId);
        if (dist < minDistance) minDistance = dist;
      }
    }

    if (cluster.length >= 2) {
      assigned.add(entries[i].fileId);
      // Derive bit count from fingerprint length (each hex char = 4 bits) so similarity
      // is correct regardless of fingerprint size (64-bit image, 256-bit video, 7680-bit audio).
      const bits = entries[i].fingerprint.length * 4;
      const similarityScore = hammingToSimilarity(minDistance === Infinity ? 0 : minDistance, bits);
      clusters.push({
        representativeFingerprint: entries[i].fingerprint,
        similarityScore,
        fileIds: cluster,
      });
    }
  }

  return clusters;
};
