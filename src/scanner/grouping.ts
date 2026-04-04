import { hammingDistance, hammingToSimilarity } from '../strategies/perceptualImage.js';

type FingerprintEntry = { fileId: number; fingerprint: string };

export type MatchCluster = {
  representativeFingerprint: string;
  similarityScore: number;
  fileIds: number[];
};

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

  const assigned = new Set<number>();
  const clusters: MatchCluster[] = [];

  for (let i = 0; i < entries.length; i++) {
    if (assigned.has(entries[i].fileId)) continue;

    const cluster: number[] = [entries[i].fileId];
    let minDistance = Infinity;

    for (let j = i + 1; j < entries.length; j++) {
      if (assigned.has(entries[j].fileId)) continue;
      const dist = hammingDistance(entries[i].fingerprint, entries[j].fingerprint);
      if (dist <= threshold) {
        cluster.push(entries[j].fileId);
        assigned.add(entries[j].fileId);
        if (dist < minDistance) minDistance = dist;
      }
    }

    if (cluster.length >= 2) {
      assigned.add(entries[i].fileId);
      const similarityScore = hammingToSimilarity(minDistance === Infinity ? 0 : minDistance);
      clusters.push({
        representativeFingerprint: entries[i].fingerprint,
        similarityScore,
        fileIds: cluster,
      });
    }
  }

  return clusters;
};
