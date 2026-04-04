import { it, expect } from 'vitest';
import { join } from 'node:path';
import { createMetadataStrategy } from './metadata.js';

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
