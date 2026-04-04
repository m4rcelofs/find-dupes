import { it, expect } from 'vitest';
import { join } from 'node:path';
import { createPerceptualImageStrategy, hammingDistance, hammingToSimilarity } from './perceptualImage.js';

const FIXTURES = join(import.meta.dirname, 'fixtures');
const strategy = createPerceptualImageStrategy();

it('produces a 16-char hex fingerprint', async () => {
  const result = await strategy.analyze({ path: join(FIXTURES, 'red-10x10.jpg'), mimeType: 'image/jpeg' });
  expect(result.fingerprint).toMatch(/^[0-9a-f]{16}$/);
});

it('produces identical hashes for the same image', async () => {
  const a = await strategy.analyze({ path: join(FIXTURES, 'red-10x10.jpg'), mimeType: 'image/jpeg' });
  const b = await strategy.analyze({ path: join(FIXTURES, 'red-10x10.jpg'), mimeType: 'image/jpeg' });
  expect(a.fingerprint).toBe(b.fingerprint);
});

it('produces low hamming distance for perceptually similar images', async () => {
  // red-10x10 and red-20x20 are the same color at different sizes
  const a = await strategy.analyze({ path: join(FIXTURES, 'red-10x10.jpg'), mimeType: 'image/jpeg' });
  const b = await strategy.analyze({ path: join(FIXTURES, 'red-20x20.jpg'), mimeType: 'image/jpeg' });
  expect(hammingDistance(a.fingerprint, b.fingerprint)).toBeLessThanOrEqual(10);
});

it('produces high hamming distance for very different images', async () => {
  const a = await strategy.analyze({ path: join(FIXTURES, 'red-10x10.jpg'), mimeType: 'image/jpeg' });
  const b = await strategy.analyze({ path: join(FIXTURES, 'blue-10x10.png'), mimeType: 'image/png' });
  expect(hammingDistance(a.fingerprint, b.fingerprint)).toBeGreaterThan(10);
});

it('only applies to images', () => {
  expect(strategy.supportedMimeTypes.every((m) => m.startsWith('image/'))).toBe(true);
});

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
