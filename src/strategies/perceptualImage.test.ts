import { it, expect, beforeAll, afterAll } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { unlink } from 'node:fs/promises';
import sharp from 'sharp';
import { createPerceptualImageStrategy, hammingDistance, hammingToSimilarity } from './perceptualImage.js';

const FIXTURES = join(import.meta.dirname, 'fixtures');
const strategy = createPerceptualImageStrategy();

// ─── Synthetic test images ────────────────────────────────────────────────────
// Generated here rather than committed, so tests don't depend on fragile JPEG
// fixture binary content. All saved as PNG (lossless) to avoid re-encoding drift.

const TMP = tmpdir();
const hGradPath    = join(TMP, 'fd-test-hgrad.png');    // horizontal gradient
const rotatedPath  = join(TMP, 'fd-test-rotated.png');  // hGrad rotated 90° → vertical gradient
const flippedPath  = join(TMP, 'fd-test-flipped.png');  // hGrad flipped vertically
const uniformPath  = join(TMP, 'fd-test-uniform.png');  // solid mid-grey — structurally unrelated

const SIZE = 40;

const makePNG = (pixels: Uint8Array, path: string) =>
  sharp(Buffer.from(pixels), { raw: { width: SIZE, height: SIZE, channels: 1 } })
    .png().toFile(path);

beforeAll(async () => {
  const hGrad = new Uint8Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++)
      hGrad[y * SIZE + x] = Math.round((x / (SIZE - 1)) * 255);

  const uniform = new Uint8Array(SIZE * SIZE).fill(128);

  await makePNG(hGrad, hGradPath);
  await makePNG(uniform, uniformPath);
  // Rotate and flip via sharp (PNG → PNG, no lossy step)
  await sharp(hGradPath).rotate(90).png().toFile(rotatedPath);
  await sharp(hGradPath).flip().png().toFile(flippedPath);
});

afterAll(() =>
  Promise.all([hGradPath, rotatedPath, flippedPath, uniformPath]
    .map((p) => unlink(p).catch(() => {}))),
);

// ─── Core behaviour ───────────────────────────────────────────────────────────

it('produces a 16-char hex fingerprint', async () => {
  const result = await strategy.analyze({ path: join(FIXTURES, 'red-10x10.jpg'), mimeType: 'image/jpeg' });
  expect(result.fingerprint).toMatch(/^[0-9a-f]{16}$/);
});

it('produces identical hashes for the same image', async () => {
  const a = await strategy.analyze({ path: hGradPath, mimeType: 'image/png' });
  const b = await strategy.analyze({ path: hGradPath, mimeType: 'image/png' });
  expect(a.fingerprint).toBe(b.fingerprint);
});

it('produces low hamming distance for perceptually similar images (different JPEG quality)', async () => {
  const a = await strategy.analyze({ path: join(FIXTURES, 'red-10x10.jpg'), mimeType: 'image/jpeg' });
  const b = await strategy.analyze({ path: join(FIXTURES, 'red-20x20.jpg'), mimeType: 'image/jpeg' });
  expect(hammingDistance(a.fingerprint, b.fingerprint)).toBeLessThanOrEqual(10);
});

it('produces high hamming distance for structurally different images', async () => {
  // Horizontal gradient vs solid grey — completely different DCT frequency content.
  const a = await strategy.analyze({ path: hGradPath, mimeType: 'image/png' });
  const b = await strategy.analyze({ path: uniformPath, mimeType: 'image/png' });
  expect(hammingDistance(a.fingerprint, b.fingerprint)).toBeGreaterThan(10);
});

it('only applies to images', () => {
  expect(strategy.supportedMimeTypes.every((m) => m.startsWith('image/'))).toBe(true);
});

// ─── Rotation / flip invariance ───────────────────────────────────────────────

it('produces the same hash for an image rotated 90°', async () => {
  const a = await strategy.analyze({ path: hGradPath, mimeType: 'image/png' });
  const b = await strategy.analyze({ path: rotatedPath, mimeType: 'image/png' });
  expect(hammingDistance(a.fingerprint, b.fingerprint)).toBe(0);
});

it('produces the same hash for a vertically flipped image', async () => {
  const a = await strategy.analyze({ path: hGradPath, mimeType: 'image/png' });
  const b = await strategy.analyze({ path: flippedPath, mimeType: 'image/png' });
  expect(hammingDistance(a.fingerprint, b.fingerprint)).toBe(0);
});

// ─── hammingDistance / hammingToSimilarity ────────────────────────────────────

it('hammingDistance returns 0 for equal hashes', () => {
  expect(hammingDistance('0000000000000000', '0000000000000000')).toBe(0);
});

it('hammingDistance returns 64 for fully inverted hashes', () => {
  expect(hammingDistance('0000000000000000', 'ffffffffffffffff')).toBe(64);
});

it('hammingToSimilarity returns 100 for distance 0', () => {
  expect(hammingToSimilarity(0)).toBe(100);
});

it('hammingToSimilarity returns 0 for distance 64', () => {
  expect(hammingToSimilarity(64)).toBe(0);
});

it('hammingDistance throws on length mismatch', () => {
  expect(() => hammingDistance('0000', 'ffffffff')).toThrow('length mismatch');
});
