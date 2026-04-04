import { it, expect } from 'vitest';
import { computeQualityScore } from './qualityScoring.js';

it('scores images by resolution (width × height)', () => {
  const hd = computeQualityScore({ width: 1920, height: 1080 }, 'image/jpeg', 2_000_000);
  const sd = computeQualityScore({ width: 640, height: 480 }, 'image/jpeg', 500_000);
  expect(hd).toBeGreaterThan(sd);
});

it('falls back to file size when no dimensions', () => {
  const big = computeQualityScore({}, 'image/jpeg', 2_000_000);
  const small = computeQualityScore({}, 'image/jpeg', 500_000);
  expect(big).toBeGreaterThan(small);
});

it('scores videos by resolution × bitrate', () => {
  const hq = computeQualityScore({ width: 1920, height: 1080, bitrate: 8_000_000 }, 'video/mp4', 1_000_000_000);
  const lq = computeQualityScore({ width: 640, height: 480, bitrate: 1_000_000 }, 'video/mp4', 100_000_000);
  expect(hq).toBeGreaterThan(lq);
});

it('returns 0 for empty metadata and zero file size', () => {
  expect(computeQualityScore({}, 'image/jpeg', 0)).toBe(0);
});

it('falls back to file size for video when dimensions or bitrate is missing', () => {
  const bySize = computeQualityScore({ width: 1920, height: 1080 }, 'video/mp4', 500_000); // no bitrate
  const bigger = computeQualityScore({}, 'video/mp4', 1_000_000);
  // no bitrate → falls back to fileSize
  expect(bySize).toBe(500_000);
  expect(bigger).toBe(1_000_000);
});
