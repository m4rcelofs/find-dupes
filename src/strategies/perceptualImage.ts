import sharp from 'sharp';
import type { Strategy, StrategyResult, FileInfo } from '../types.js';

/**
 * Hamming distance between two hex-encoded fingerprints — counts differing bits.
 * Implemented via BigInt XOR + population count. Throws if lengths differ (indicates
 * a strategy bug: mixed hash sizes from different algorithm versions).
 */
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
 * Convert Hamming distance to a 0–100 similarity score: `(bits - distance) / bits * 100`.
 *
 * @param bits Total bits in the fingerprint.
 *   - 64 for image dHash (16 hex chars). Distance of 5 → 92.2% similar.
 *   - 256 for video fingerprints (64 hex chars = 4 frames × 64 bits). Distance of 5 → 98.1% similar.
 */
export const hammingToSimilarity = (distance: number, bits = 64): number =>
  ((bits - distance) / bits) * 100;

/**
 * dHash (difference hash) algorithm:
 * 1. Resize to 9×8 px (9 wide so each row yields 8 left-right comparisons).
 * 2. Grayscale — perceptual similarity is about structure, not colour.
 * 3. For each of the 8 rows, set a bit if the left pixel is brighter than its right neighbour.
 * 4. Encode the 64-bit result as a 16-char hex string.
 *
 * Robust to: JPEG re-compression, minor colour adjustments, slight crops/resizes, format conversion.
 * Not robust to: large crops, rotations, flips.
 */
const computeDHash = async (imagePath: string): Promise<string> => {
  const { data } = await sharp(imagePath, { pages: 1 })
    .flatten({ background: '#ffffff' })
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

/**
 * Perceptual image strategy using dHash.
 *
 * Supported formats: JPEG, PNG, WebP, GIF, TIFF, HEIC, HEIF — anything `sharp` can decode.
 * Default threshold of 10 (out of 64 bits) is a practical starting point: catches near-identical
 * photos while avoiding false positives between different subjects.
 *
 * `hammingDistance` and `hammingToSimilarity` are exported for reuse by `grouping.ts` and
 * `perceptualVideo.ts`.
 */
export const createPerceptualImageStrategy = (): Strategy => ({
  name: 'perceptualImage',
  supportedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/tiff', 'image/heic', 'image/heif'],

  analyze: async (file: Pick<FileInfo, 'path' | 'mimeType'>): Promise<StrategyResult> => ({
    fingerprint: await computeDHash(file.path),
  }),
});
