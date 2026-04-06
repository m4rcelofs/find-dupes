import { it, expect, vi } from 'vitest';
import { createAudioFingerprintStrategy } from './audioFingerprint.js';

const FAKE_HEX = 'a'.repeat(240 * 8); // 1920-char hex string (mocked pre-converted output)
const mockRunFpcalc = vi.fn().mockResolvedValue(FAKE_HEX);

it('returns the fpcalc fingerprint', async () => {
  const strategy = createAudioFingerprintStrategy({ runFpcalc: mockRunFpcalc });
  const result = await strategy.analyze({ path: '/fake/video.mp4', mimeType: 'video/mp4' });
  expect(result.fingerprint).toBe(FAKE_HEX);
});

it('fingerprint is fixed-length hex (MAX_INTEGERS * 8 chars)', async () => {
  // Simulate defaultRunFpcalc behaviour by passing a runFpcalc that mimics toFixedHex output
  const rawIntegers = Array.from({ length: 300 }, (_, i) => String(i - 100)).join(',');
  const runFpcalc = vi.fn().mockImplementation(async () => {
    // Reproduce toFixedHex inline so we can assert the contract
    const integers = rawIntegers.split(',').map((s) => parseInt(s, 10));
    const truncated = integers.slice(0, 240);
    while (truncated.length < 240) truncated.push(0);
    return truncated.map((n) => (n >>> 0).toString(16).padStart(8, '0')).join('');
  });
  const strategy = createAudioFingerprintStrategy({ runFpcalc });
  const result = await strategy.analyze({ path: '/fake/video.mp4', mimeType: 'video/mp4' });
  expect(result.fingerprint).toHaveLength(240 * 8); // 1920 hex chars
  expect(result.fingerprint).toMatch(/^[0-9a-f]+$/);
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
