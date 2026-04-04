import sharp from 'sharp';
import type { Strategy, StrategyResult, FileInfo } from '../types.js';

export const hammingDistance = (a: string, b: string): number => {
  if (a.length !== b.length) throw new Error(`hammingDistance: fingerprint length mismatch (${a.length} vs ${b.length})`);
  if (a.length === 0) return 0;
  let xor = BigInt('0x' + a) ^ BigInt('0x' + b);
  let count = 0;
  while (xor > 0n) {
    count += Number(xor & 1n);
    xor >>= 1n;
  }
  return count;
};

/**
 * Convert hamming distance to a 0–100 similarity score.
 * @param bits Total number of bits in the fingerprint.
 *             Use 64 for image dHash (16 hex chars).
 *             Use 256 for video fingerprints (64 hex chars = 4 frames × 64 bits).
 */
export const hammingToSimilarity = (distance: number, bits = 64): number =>
  ((bits - distance) / bits) * 100;

const computeDHash = async (imagePath: string): Promise<string> => {
  const { data } = await sharp(imagePath)
    .resize(9, 8, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let hash = 0n;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const left = data[row * 9 + col];
      const right = data[row * 9 + col + 1];
      if (left > right) hash |= 1n << BigInt(row * 8 + col);
    }
  }
  return hash.toString(16).padStart(16, '0');
};

export const createPerceptualImageStrategy = (): Strategy => ({
  name: 'perceptualImage',
  supportedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/tiff', 'image/heic', 'image/heif'],

  analyze: async (file: Pick<FileInfo, 'path' | 'mimeType'>): Promise<StrategyResult> => ({
    fingerprint: await computeDHash(file.path),
  }),
});
