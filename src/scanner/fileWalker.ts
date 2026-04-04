import { readdir, stat, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { lookup as mimeLookup } from 'mime-types';

const SUPPORTED_MIME_PREFIXES = ['image/', 'video/'];

const isSupportedMime = (mime: string | false): mime is string =>
  mime !== false && SUPPORTED_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix));

export type WalkedFile = {
  path: string;
  size: number;
  mtime: number;
  mimeType: string;
};

export const walkDirectory = async (
  dir: string,
  onFile: (file: WalkedFile) => void,
): Promise<void> => {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;

    const fullPath = join(dir, entry.name);

    // Use lstat so we can detect symlinks without following them
    const lstats = await lstat(fullPath);
    if (lstats.isSymbolicLink()) continue;

    if (entry.isDirectory()) {
      await walkDirectory(fullPath, onFile);
      continue;
    }

    if (!entry.isFile()) continue;

    const mimeType = mimeLookup(entry.name);
    if (!isSupportedMime(mimeType)) continue;

    const fileStat = await stat(fullPath);
    onFile({
      path: fullPath,
      size: fileStat.size,
      mtime: Math.floor(fileStat.mtimeMs),
      mimeType,
    });
  }
};
