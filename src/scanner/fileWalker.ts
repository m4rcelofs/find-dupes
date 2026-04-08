import { readdir, lstat, access } from 'node:fs/promises';
import { join } from 'node:path';
import { lookup as mimeLookup } from 'mime-types';

const SUPPORTED_MIME_PREFIXES = ['image/', 'video/'];

// Formats whose extensions have no registered MIME type (or a non-image/* vendor type)
// are remapped here so downstream strategies that match image/* or video/* wildcards work.
const MIME_REMAPS: Record<string, string> = {
  // RealMedia video
  'application/vnd.rn-realmedia':     'video/x-realmedia',
  'application/vnd.rn-realmedia-vbr': 'video/x-realmedia-vbr',
};

// RAW camera formats have no registered MIME type — map by extension.
// These resolve to image/x-<brand>-<ext> so image/* wildcards match them.
const EXTENSION_REMAPS: Record<string, string> = {
  '.nef': 'image/x-nikon-nef',       // Nikon
  '.nrw': 'image/x-nikon-nrw',       // Nikon (compact)
  '.cr2': 'image/x-canon-cr2',       // Canon
  '.cr3': 'image/x-canon-cr3',       // Canon (newer)
  '.arw': 'image/x-sony-arw',        // Sony
  '.dng': 'image/x-adobe-dng',       // Adobe / Leica / Pentax / others
  '.orf': 'image/x-olympus-orf',     // Olympus
  '.rw2': 'image/x-panasonic-rw2',   // Panasonic
  '.raf': 'image/x-fuji-raf',        // Fujifilm
  '.pef': 'image/x-pentax-pef',      // Pentax
  '.srw': 'image/x-samsung-srw',     // Samsung
  '.x3f': 'image/x-sigma-x3f',       // Sigma
  '.mrw': 'image/x-minolta-mrw',     // Minolta / Konica Minolta
  '.rwl': 'image/x-leica-rwl',       // Leica
  '.3fr': 'image/x-hasselblad-3fr',  // Hasselblad
  '.mef': 'image/x-mamiya-mef',      // Mamiya
  '.erf': 'image/x-epson-erf',       // Epson
  '.kdc': 'image/x-kodak-kdc',       // Kodak
  '.dcr': 'image/x-kodak-dcr',       // Kodak
};

const normalizeMime = (mime: string | false, ext: string): string | false => {
  if (mime !== false && MIME_REMAPS[mime]) return MIME_REMAPS[mime];
  if (EXTENSION_REMAPS[ext]) return EXTENSION_REMAPS[ext];
  return mime;
};

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

/** Counts supported files inside a directory recursively, used to report ignored dir stats. */
const countSupportedFiles = async (dir: string): Promise<number> => {
  let count = 0;
  await walkDirectory(dir, () => { count++; });
  return count;
};

/**
 * Recursively walks `dir` and calls `onFile` for each supported image or video file.
 *
 * Rules:
 * - Directories containing a `.scanignore` file are skipped entirely.
 * - Dot files and dot directories are skipped (`.DS_Store`, `.Trash`, `.find-dupes.db`, etc.).
 * - Symlinks are skipped — detected via `lstat` to avoid infinite loops and files outside the root.
 * - Only `image/*` and `video/*` MIME types are yielded, inferred from extension via `mime-types`.
 *   Covers JPEG, PNG, WebP, HEIC, GIF, TIFF, MP4, MOV, AVI, MKV, WebM, MPEG, RM, RMVB, and more.
 *   Formats with non-standard vendor MIME types (e.g. RM/RMVB) are remapped to `video/*` via
 *   `MIME_REMAPS` so downstream strategies match them correctly.
 * - `size` and `mtime` reuse the `lstat` result from the symlink check — no redundant stat call.
 *
 * @param onSkipped Optional callback for files that are skipped due to unsupported MIME type.
 * @param onIgnored Optional callback for directories skipped due to `.scanignore`, with file count.
 */
export const walkDirectory = async (
  dir: string,
  onFile: (file: WalkedFile) => void,
  onSkipped?: (file: SkippedFile) => void,
  onIgnored?: (dirPath: string, fileCount: number) => void,
): Promise<void> => {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;

    const fullPath = join(dir, entry.name);

    // Use lstat so we can detect symlinks without following them
    const lstats = await lstat(fullPath);
    if (lstats.isSymbolicLink()) continue;

    if (entry.isDirectory()) {
      const ignored = await access(join(fullPath, '.scanignore')).then(() => true).catch(() => false);
      if (ignored) {
        const fileCount = await countSupportedFiles(fullPath);
        onIgnored?.(fullPath, fileCount);
        continue;
      }
      await walkDirectory(fullPath, onFile, onSkipped, onIgnored);
      continue;
    }

    if (!entry.isFile()) continue;

    const rawMime = mimeLookup(entry.name);
    const ext = entry.name.includes('.') ? `.${entry.name.split('.').pop()!.toLowerCase()}` : '';
    const mimeType = normalizeMime(rawMime, ext);
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
