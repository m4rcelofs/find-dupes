import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findVolumeRoot, moveToFallbackTrash, safeTrash, FALLBACK_TRASH_DIR } from './safeTrash.js';

let volume: string;

beforeEach(() => {
  volume = mkdtempSync(join(tmpdir(), 'find-dupes-safetrash-'));
});

afterEach(() => rmSync(volume, { recursive: true, force: true }));

const seedFile = (relPath: string, content = 'payload'): string => {
  const abs = join(volume, relPath);
  mkdirSync(join(abs, '..'), { recursive: true });
  writeFileSync(abs, content);
  return abs;
};

describe('findVolumeRoot', () => {
  it('returns the mount point containing the file', () => {
    // Everything under the OS temp dir lives on the root volume.
    expect(findVolumeRoot(seedFile('a.jpg'))).toBe('/');
  });
});

describe('moveToFallbackTrash', () => {
  it('moves the file into the trash dir preserving its path below the volume root', () => {
    const file = seedFile('photos/2024/a.jpg');
    const dest = moveToFallbackTrash(file, volume);
    expect(dest).toBe(join(volume, FALLBACK_TRASH_DIR, 'photos/2024/a.jpg'));
    expect(existsSync(file)).toBe(false);
    expect(readFileSync(dest, 'utf8')).toBe('payload');
  });

  it('does not overwrite a file already sitting in the trash dir', () => {
    const first = seedFile('photos/a.jpg', 'first');
    const firstDest = moveToFallbackTrash(first, volume);
    const second = seedFile('photos/a.jpg', 'second');
    const secondDest = moveToFallbackTrash(second, volume);

    expect(secondDest).not.toBe(firstDest);
    expect(readFileSync(firstDest, 'utf8')).toBe('first');
    expect(readFileSync(secondDest, 'utf8')).toBe('second');
  });
});

describe('safeTrash', () => {
  const volumeHasNoTrash = async () => {
    throw new Error('couldn’t be moved to the trash because the volume doesn’t have one.');
  };

  it('falls back to the trash dir when the volume has no system trash', async () => {
    const file = seedFile('photos/a.jpg');
    const result = await safeTrash(file, { fallback: true, volumeRoot: volume, trashImpl: volumeHasNoTrash });

    expect(result.method).toBe('fallback');
    expect(existsSync(file)).toBe(false);
    expect(existsSync(join(volume, FALLBACK_TRASH_DIR, 'photos/a.jpg'))).toBe(true);
  });

  it('reports the system trash when it works, leaving no fallback dir behind', async () => {
    const file = seedFile('photos/a.jpg');
    const result = await safeTrash(file, {
      fallback: true,
      volumeRoot: volume,
      trashImpl: async (p) => rmSync(p as string),
    });

    expect(result.method).toBe('trash');
    expect(existsSync(join(volume, FALLBACK_TRASH_DIR))).toBe(false);
  });

  it('rethrows the original trash error when the fallback is disabled', async () => {
    const file = seedFile('photos/a.jpg');
    await expect(
      safeTrash(file, { fallback: false, volumeRoot: volume, trashImpl: volumeHasNoTrash }),
    ).rejects.toThrow(/doesn’t have one/);
    expect(existsSync(file)).toBe(true);
  });
});
