import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { createMetadataStrategy } from './metadata.js';
import ffmpeg from 'fluent-ffmpeg';

const FIXTURES = join(import.meta.dirname, 'fixtures');
const strategy = createMetadataStrategy();

it('extracts width and height from a JPEG', async () => {
  const result = await strategy.analyze({ path: join(FIXTURES, 'red-10x10.jpg'), mimeType: 'image/jpeg' });
  expect(result.metadata?.width).toBe(10);
  expect(result.metadata?.height).toBe(10);
});

it('extracts width and height from a PNG', async () => {
  const result = await strategy.analyze({ path: join(FIXTURES, 'blue-10x10.png'), mimeType: 'image/png' });
  expect(result.metadata?.width).toBe(10);
  expect(result.metadata?.height).toBe(10);
});

it('produces a non-empty fingerprint', async () => {
  const result = await strategy.analyze({ path: join(FIXTURES, 'red-10x10.jpg'), mimeType: 'image/jpeg' });
  expect(result.fingerprint.length).toBeGreaterThan(0);
});

it('applies to images and videos', () => {
  expect(strategy.supportedMimeTypes).toContain('image/*');
  expect(strategy.supportedMimeTypes).toContain('video/*');
});

it('extracts duration and bitrate from a video via ffprobe', async () => {
  const mockProbe = vi.spyOn(ffmpeg, 'ffprobe').mockImplementation(
    (_path: string, cb: (err: Error | null, data: ffmpeg.FfprobeData) => void) => {
      cb(null, {
        streams: [{ codec_type: 'video', width: 1920, height: 1080 }],
        format: { bit_rate: '8000000', duration: '120.5' },
        chapters: [],
      } as unknown as ffmpeg.FfprobeData);
    },
  );

  const result = await strategy.analyze({ path: '/fake/video.mp4', mimeType: 'video/mp4' });
  expect(result.metadata?.width).toBe(1920);
  expect(result.metadata?.height).toBe(1080);
  expect(result.metadata?.bitrate).toBe(8000000);
  expect(result.metadata?.duration).toBeCloseTo(120.5);

  mockProbe.mockRestore();
});
