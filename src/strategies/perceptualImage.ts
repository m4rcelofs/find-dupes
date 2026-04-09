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

// ─── pHash internals ──────────────────────────────────────────────────────────

const N = 32; // resize dimension
const K = 8;  // DCT coefficients per axis to retain

// Precomputed once at module load — shared across all calls.
const COS_TABLE: number[][] = Array.from({ length: K }, (_, k) =>
  Array.from({ length: N }, (_, n) => Math.cos(((2 * n + 1) * k * Math.PI) / (2 * N))),
);

/**
 * Returns a new N×N pixel buffer with one of the 8 dihedral orientations applied.
 * For output pixel (tx, ty), reads source pixel (sx, sy) as defined by the transform index.
 *
 *   0 = identity            4 = flip horizontal
 *   1 = rotate 90° CW       5 = transpose (flip H + rotate 270°)
 *   2 = rotate 180°         6 = flip vertical (flip H + rotate 180°)
 *   3 = rotate 270° CW      7 = anti-transpose (flip H + rotate 90°)
 */
const applyTransform = (data: Buffer, t: number): Uint8Array => {
  const out = new Uint8Array(N * N);
  for (let tx = 0; tx < N; tx++) {
    for (let ty = 0; ty < N; ty++) {
      let sx: number, sy: number;
      switch (t) {
        case 1:  sx = N-1-ty; sy = tx;     break; // rotate 90° CW
        case 2:  sx = N-1-tx; sy = N-1-ty; break; // rotate 180°
        case 3:  sx = ty;     sy = N-1-tx; break; // rotate 270° CW
        case 4:  sx = tx;     sy = N-1-ty; break; // flip horizontal
        case 5:  sx = ty;     sy = tx;     break; // transpose
        case 6:  sx = N-1-tx; sy = ty;     break; // flip vertical
        case 7:  sx = N-1-ty; sy = N-1-tx; break; // anti-transpose
        default: sx = tx;     sy = ty;     break; // identity
      }
      out[tx * N + ty] = data[sx * N + sy];
    }
  }
  return out;
};

/** Compute the 64-bit pHash of a pre-transformed N×N grayscale pixel buffer. */
const pHashBits = (pixels: Uint8Array | Buffer): bigint => {
  // Separable 2D DCT — step 1: row DCT, keep K coefficients per row.
  const rows = new Float64Array(N * K);
  for (let x = 0; x < N; x++) {
    for (let v = 0; v < K; v++) {
      let sum = 0;
      for (let y = 0; y < N; y++) sum += pixels[x * N + y] * COS_TABLE[v][y];
      rows[x * K + v] = sum;
    }
  }
  // Step 2: column DCT → K×K coefficients.
  const dct = new Float64Array(K * K);
  for (let u = 0; u < K; u++) {
    for (let v = 0; v < K; v++) {
      let sum = 0;
      for (let x = 0; x < N; x++) sum += rows[x * K + v] * COS_TABLE[u][x];
      dct[u * K + v] = sum;
    }
  }
  // Mean of the 63 non-DC coefficients (DC at index 0 encodes average brightness only).
  const mean = (dct.reduce((s, v) => s + v, 0) - dct[0]) / (K * K - 1);
  let hash = 0n;
  for (let i = 0; i < K * K; i++) {
    if (dct[i] >= mean) hash |= 1n << BigInt(i);
  }
  return hash;
};

/**
 * pHash with orientation normalisation:
 *
 * 1. Resize to 32×32 grayscale (one sharp call).
 * 2. Apply all 8 dihedral transforms in-memory (simple array ops on 1 024 pixels each).
 * 3. Compute pHash for each orientation.
 * 4. Store the minimum hash as the canonical fingerprint.
 *
 * Because both images independently derive the same canonical form, two images that are
 * rotations or reflections of each other will produce identical fingerprints and match at
 * Hamming distance 0.
 *
 * Robust to: JPEG re-compression, minor colour/brightness adjustments, slight crops/resizes,
 *            format conversion, 90°/180°/270° rotations, horizontal/vertical flips.
 * Not robust to: large crops, arbitrary-angle rotations.
 *
 * NOTE: incompatible with previous dHash or non-normalised pHash fingerprints in the DB.
 * Re-scan with --force to recompute all perceptualImage results.
 */
const computePHash = async (imagePath: string): Promise<string> => {
  const { data } = await sharp(imagePath, { pages: 1 })
    .flatten({ background: '#ffffff' })
    .resize(N, N, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let canonical = BigInt('0xffffffffffffffff');
  for (let t = 0; t < 8; t++) {
    const pixels = t === 0 ? data : applyTransform(data, t);
    const h = pHashBits(pixels);
    if (h < canonical) canonical = h;
  }
  return canonical.toString(16).padStart(16, '0');
};

/**
 * Perceptual image strategy using orientation-normalised pHash (DCT-based).
 *
 * Supported formats: JPEG, PNG, WebP, GIF, TIFF, HEIC, HEIF — anything `sharp` can decode.
 * Default threshold of 10 (out of 64 bits) catches near-identical photos while avoiding
 * false positives.
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
