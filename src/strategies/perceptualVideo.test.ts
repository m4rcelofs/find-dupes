import { it, expect, vi } from 'vitest';
import { createPerceptualVideoStrategy } from './perceptualVideo.js';

// We mock ffmpeg frame extraction since we don't have video fixtures
const mockExtractFrames = vi.fn().mockResolvedValue([
  Buffer.from('fake-frame-1'),
  Buffer.from('fake-frame-2'),
]);

it('produces a fingerprint string', async () => {
  const strategy = createPerceptualVideoStrategy({ extractFrames: mockExtractFrames });
  const result = await strategy.analyze({ path: '/fake/video.mp4', mimeType: 'video/mp4' });
  expect(typeof result.fingerprint).toBe('string');
  expect(result.fingerprint.length).toBeGreaterThan(0);
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
