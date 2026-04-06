import { readdir, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { lookup as mimeLookup } from 'mime-types';

const SUPPORTED_MIME_PREFIXES = ['image/', 'video/'];

// Some formats use non-standard vendor MIME types. Remap them to video/* so downstream
// strategies that match on video/* wildcards work without special-casing each one.
const MIME_REMAPS: Record<string, string> = {
  'application/vnd.rn-realmedia': 'video/x-realmedia',
  'application/vnd.rn-realmedia-vbr': 'video/x-realmedia-vbr',
};

const normalizeMime = (mime: string | false): string | false =>
  mime !== false ? (MIME_REMAPS[mime] ?? mime) : false;

const isSupportedMime = (mime: string | false): mime is string =>
  mime !== false && SUPPORTED_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix));

export type WalkedFile = {
  path: string;
  size: number;
  mtime: number;
  mimeType: string;
};

export type SkippedFile = {
  path: string;
  /** Raw (un-remapped) MIME type from extension lookup, or false if the extension is unknown. */
  mimeType: string | false;
};

/**
 * Recursively walks `dir` and calls `onFile` for each supported image or video file.
 *
 * Rules:
 * - Dot files and dot directories are skipped (`.DS_Store`, `.Trash`, `.find-dupes.db`, etc.).
 * - Symlinks are skipped — detected via `lstat` to avoid infinite loops and files outside the root.
 * - Only `image/*` and `video/*` MIME types are yielded, inferred from extension via `mime-types`.
 *   Covers JPEG, PNG, WebP, HEIC, GIF, TIFF, MP4, MOV, AVI, MKV, WebM, MPEG, RM, RMVB, and more.
 *   Formats with non-standard vendor MIME types (e.g. RM/RMVB) are remapped to `video/*` via
 *   `MIME_REMAPS` so downstream strategies match them correctly.
 * - `size` and `mtime` reuse the `lstat` result from the symlink check — no redundant stat call.
 *
 * @param onSkipped Optional callback for files that are skipped due to unsupported MIME type.
 *   Receives the raw (pre-remap) MIME type so callers can report what was found.
 */
export const walkDirectory = async (
  dir: string,
  onFile: (file: WalkedFile) => void,
  onSkipped?: (file: SkippedFile) => void,
): Promise<void> => {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;

    const fullPath = join(dir, entry.name);

    // Use lstat so we can detect symlinks without following them
    const lstats = await lstat(fullPath);
    if (lstats.isSymbolicLink()) continue;

    if (entry.isDirectory()) {
      await walkDirectory(fullPath, onFile, onSkipped);
      continue;
    }

    if (!entry.isFile()) continue;

    const rawMime = mimeLookup(entry.name);
    const mimeType = normalizeMime(rawMime);
    if (!isSupportedMime(mimeType)) {
      onSkipped?.({ path: fullPath, mimeType: rawMime });
      continue;
    }

    onFile({
      path: fullPath,
      size: lstats.size,
      mtime: Math.floor(lstats.mtimeMs),
      mimeType,
    });
  }
};
