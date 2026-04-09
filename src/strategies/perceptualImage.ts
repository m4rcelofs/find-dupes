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
 *   - 64 for image pHash (16 hex chars). Distance of 5 → 92.2% similar.
 *   - 256 for video fingerprints (64 hex chars = 4 frames × 64 bits). Distance of 5 → 98.1% similar.
 */
export const hammingToSimilarity = (distance: number, bits = 64): number =>
  ((bits - distance) / bits) * 100;

/**
 * pHash (perceptual hash) using a 2D DCT:
 * 1. Resize to 32×32 px and convert to grayscale.
 * 2. Apply a separable 2D DCT, retaining only the top-left 8×8 low-frequency coefficients.
 * 3. Compute the mean of the 63 non-DC coefficients (DC at [0,0] is excluded — it just
 *    encodes average brightness and dominates the variance).
 * 4. Set each of the 64 bits to 1 if its coefficient is ≥ mean, 0 otherwise.
 * 5. Encode as a 16-char hex string.
 *
 * Why pHash over dHash:
 * - dHash compares adjacent pixels in a 9×8 grid — only 64 coarse gradient directions.
 *   Very different images can share the same macro gradient pattern and produce nearly
 *   identical hashes.
 * - pHash operates in the frequency domain on a 32×32 image.  Low-frequency DCT
 *   coefficients capture the overall structure of the image far more distinctively,
 *   giving far fewer false positives at the same bit threshold.
 *
 * Robust to: JPEG re-compression, minor colour/brightness adjustments, slight crops/resizes,
 *            format conversion.
 * Not robust to: large crops, rotations, flips.
 *
 * NOTE: existing dHash fingerprints stored in the DB are incompatible. Re-scan with --force
 * after upgrading to pHash to recompute all perceptualImage results.
 */
const computePHash = async (imagePath: string): Promise<string> => {
  const N = 32; // resize dimension
  const K = 8;  // DCT coefficients per axis to keep

  const { data } = await sharp(imagePath, { pages: 1 })
    .flatten({ background: '#ffffff' })
    .resize(N, N, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Precompute cosine table: cosTable[k][n] = cos((2n+1)·k·π / (2N))
  const cosTable: number[][] = Array.from({ length: K }, (_, k) =>
    Array.from({ length: N }, (_, n) => Math.cos(((2 * n + 1) * k * Math.PI) / (2 * N))),
  );

  // Separable 2D DCT — O(N²K) instead of O(N²K²).
  // Step 1: 1D DCT along each row, keeping K coefficients → N×K intermediate.
  const rows = new Float64Array(N * K);
  for (let x = 0; x < N; x++) {
    for (let v = 0; v < K; v++) {
      let sum = 0;
      for (let y = 0; y < N; y++) sum += data[x * N + y] * cosTable[v][y];
      rows[x * K + v] = sum;
    }
  }

  // Step 2: 1D DCT along each of the K columns → K×K final coefficients.
  const dct = new Float64Array(K * K);
  for (let u = 0; u < K; u++) {
    for (let v = 0; v < K; v++) {
      let sum = 0;
      for (let x = 0; x < N; x++) sum += rows[x * K + v] * cosTable[u][x];
      dct[u * K + v] = sum;
    }
  }

  // Mean of the 63 non-DC coefficients (skip dct[0] = DC component).
  const mean = (dct.reduce((s, v) => s + v, 0) - dct[0]) / (K * K - 1);

  // Hash: bit i = 1 if dct[i] ≥ mean.
  let hash = 0n;
  for (let i = 0; i < K * K; i++) {
    if (dct[i] >= mean) hash |= 1n << BigInt(i);
  }
  return hash.toString(16).padStart(16, '0');
};

/**
 * Perceptual image strategy using pHash (DCT-based).
 *
 * Supported formats: JPEG, PNG, WebP, GIF, TIFF, HEIC, HEIF — anything `sharp` can decode.
 * Default threshold of 10 (out of 64 bits) catches near-identical photos while avoiding
 * false positives. pHash is substantially more discriminating than dHash at the same threshold.
 *
 * `hammingDistance` and `hammingToSimilarity` are exported for reuse by `grouping.ts` and
 * `perceptualVideo.ts`.
 */
export const createPerceptualImageStrategy = (): Strategy => ({
  name: 'perceptualImage',
  supportedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/tiff', 'image/heic', 'image/heif'],

  analyze: async (file: Pick<FileInfo, 'path' | 'mimeType'>): Promise<StrategyResult> => ({
    fingerprint: await computePHash(file.path),
  }),
});
