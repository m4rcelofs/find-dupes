import { it, expect, vi, beforeAll } from 'vitest';
import sharp from 'sharp';
import { createPerceptualVideoStrategy } from './perceptualVideo.js';

const FRAME_COUNT = 4;

// Real tiny image buffers — exercises actual dHash code path
let realFrameBuffers: Buffer[];

beforeAll(async () => {
  // Create a 9x8 solid-color PNG in memory (smallest valid sharp input)
  const frameBuffer = await sharp({
    create: { width: 9, height: 8, channels: 3, background: { r: 200, g: 100, b: 50 } },
  })
    .png()
    .toBuffer();
  // Use FRAME_COUNT real frames
  realFrameBuffers = Array(FRAME_COUNT).fill(frameBuffer);
});

const mockExtractFrames = vi.fn(async (_path: string, _count: number) => realFrameBuffers);

it('produces a fingerprint string from real frame buffers', async () => {
  const strategy = createPerceptualVideoStrategy({ extractFrames: mockExtractFrames });
  const result = await strategy.analyze({ path: '/fake/video.mp4', mimeType: 'video/mp4' });
  expect(typeof result.fingerprint).toBe('string');
  expect(result.fingerprint.length).toBeGreaterThan(0);
});

it('fingerprint length is FRAME_COUNT × 16 hex chars', async () => {
  const strategy = createPerceptualVideoStrategy({ extractFrames: mockExtractFrames });
  const result = await strategy.analyze({ path: '/fake/video.mp4', mimeType: 'video/mp4' });
  expect(result.fingerprint.length).toBe(FRAME_COUNT * 16);
});

it('only applies to videos', () => {
  const strategy = createPerceptualVideoStrategy({ extractFrames: mockExtractFrames });
  expect(strategy.supportedMimeTypes.every((m) => m.startsWith('video/'))).toBe(true);
});

it('produces same fingerprint for same input', async () => {
  const strategy = createPerceptualVideoStrategy({ extractFrames: mockExtractFrames });
  const a = await strategy.analyze({ path: '/fake/video.mp4', mimeType: 'video/mp4' });
  const b = await strategy.analyze({ path: '/fake/video.mp4', mimeType: 'video/mp4' });
  expect(a.fingerprint).toBe(b.fingerprint);
});

it('strategy name is perceptualVideo', () => {
  const strategy = createPerceptualVideoStrategy({ extractFrames: mockExtractFrames });
  expect(strategy.name).toBe('perceptualVideo');
});
