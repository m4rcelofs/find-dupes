import { it, expect, vi } from 'vitest';
import { createAudioFingerprintStrategy } from './audioFingerprint.js';

const mockRunFpcalc = vi.fn().mockResolvedValue('AQAAC0mkZEqYREkS...');

it('returns the fpcalc fingerprint', async () => {
  const strategy = createAudioFingerprintStrategy({ runFpcalc: mockRunFpcalc });
  const result = await strategy.analyze({ path: '/fake/video.mp4', mimeType: 'video/mp4' });
  expect(result.fingerprint).toBe('AQAAC0mkZEqYREkS...');
});

it('only applies to videos', () => {
  const strategy = createAudioFingerprintStrategy({ runFpcalc: mockRunFpcalc });
  expect(strategy.supportedMimeTypes.every((m) => m.startsWith('video/'))).toBe(true);
});

it('propagates fpcalc errors', async () => {
  const failFpcalc = vi.fn().mockRejectedValue(new Error('fpcalc not found'));
  const strategy = createAudioFingerprintStrategy({ runFpcalc: failFpcalc });
  await expect(strategy.analyze({ path: '/fake/video.mp4', mimeType: 'video/mp4' })).rejects.toThrow('fpcalc not found');
});

it('strategy name is audioFingerprint', () => {
  const strategy = createAudioFingerprintStrategy({ runFpcalc: mockRunFpcalc });
  expect(strategy.name).toBe('audioFingerprint');
});
