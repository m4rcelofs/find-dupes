import { it, expect } from 'vitest';
import { join } from 'node:path';
import { createExactHashStrategy } from './exactHash.js';

const FIXTURES = join(import.meta.dirname, 'fixtures');

const strategy = createExactHashStrategy();

it('produces a 64-char hex SHA-256 fingerprint', async () => {
  const result = await strategy.analyze({ path: join(FIXTURES, 'red-10x10.jpg'), mimeType: 'image/jpeg' });
  expect(result.fingerprint).toMatch(/^[0-9a-f]{64}$/);
});

it('produces identical fingerprints for the same file', async () => {
  const a = await strategy.analyze({ path: join(FIXTURES, 'red-10x10.jpg'), mimeType: 'image/jpeg' });
  const b = await strategy.analyze({ path: join(FIXTURES, 'red-10x10.jpg'), mimeType: 'image/jpeg' });
  expect(a.fingerprint).toBe(b.fingerprint);
});

it('produces different fingerprints for different files', async () => {
  const a = await strategy.analyze({ path: join(FIXTURES, 'red-10x10.jpg'), mimeType: 'image/jpeg' });
  const b = await strategy.analyze({ path: join(FIXTURES, 'blue-10x10.png'), mimeType: 'image/png' });
  expect(a.fingerprint).not.toBe(b.fingerprint);
});

it('supports both images and videos', () => {
  expect(strategy.supportedMimeTypes.some((m) => m.startsWith('image/'))).toBe(true);
  expect(strategy.supportedMimeTypes.some((m) => m.startsWith('video/'))).toBe(true);
});
