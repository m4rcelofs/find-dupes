import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { walkDirectory } from './fileWalker.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'find-dupes-test-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

it('finds images and videos recursively', async () => {
  writeFileSync(join(root, 'photo.jpg'), Buffer.alloc(100));
  mkdirSync(join(root, 'sub'));
  writeFileSync(join(root, 'sub', 'clip.mp4'), Buffer.alloc(100));

  const files: string[] = [];
  await walkDirectory(root, (f) => files.push(f.path));
  expect(files).toContain(join(root, 'photo.jpg'));
  expect(files).toContain(join(root, 'sub', 'clip.mp4'));
});

it('skips dot-directories', async () => {
  mkdirSync(join(root, '.hidden'));
  writeFileSync(join(root, '.hidden', 'secret.jpg'), Buffer.alloc(10));

  const files: string[] = [];
  await walkDirectory(root, (f) => files.push(f.path));
  expect(files).toHaveLength(0);
});

it('skips symlinks', async () => {
  writeFileSync(join(root, 'real.jpg'), Buffer.alloc(10));
  symlinkSync(join(root, 'real.jpg'), join(root, 'link.jpg'));

  const files: string[] = [];
  await walkDirectory(root, (f) => files.push(f.path));
  // Only the real file, not the symlink
  expect(files).toHaveLength(1);
  expect(files[0]).toBe(join(root, 'real.jpg'));
});

it('ignores unsupported file types', async () => {
  writeFileSync(join(root, 'readme.txt'), 'hello');

  const files: string[] = [];
  await walkDirectory(root, (f) => files.push(f.path));
  expect(files).toHaveLength(0);
});

it('emits correct mimeType and size', async () => {
  writeFileSync(join(root, 'photo.png'), Buffer.alloc(256));

  const files: Array<{ path: string; mimeType: string; size: number }> = [];
  await walkDirectory(root, (f) => files.push(f));
  expect(files[0].mimeType).toBe('image/png');
  expect(files[0].size).toBe(256);
});
