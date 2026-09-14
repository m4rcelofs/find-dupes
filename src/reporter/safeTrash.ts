import trash from 'trash';
import { statSync, mkdirSync, renameSync, existsSync } from 'node:fs';
import { dirname, relative, join, extname, basename } from 'node:path';

/** Directory created at the volume root to hold files from volumes with no system trash. */
export const FALLBACK_TRASH_DIR = '.find-dupes-trash';

export type TrashMethod = 'trash' | 'fallback';

type SafeTrashOptions = {
  /** When false, a failing system trash is reported as an error instead of using the fallback. */
  fallback: boolean;
  /** Override the detected volume root. Test seam. */
  volumeRoot?: string;
  /** Override the system trash call. Test seam. */
  trashImpl?: (path: string) => Promise<unknown>;
};

/**
 * Finds the mount point that `filePath` lives on by walking up until the device id changes.
 *
 * On a NAS share this returns e.g. `/Volumes/Personal-Drive`; for anything on the boot
 * volume it returns `/`.
 */
export const findVolumeRoot = (filePath: string): string => {
  const { dev } = statSync(filePath);
  let dir = dirname(filePath);
  for (;;) {
    const parent = dirname(dir);
    if (parent === dir) return dir;
    let parentDev: number;
    try {
      parentDev = statSync(parent).dev;
    } catch {
      return dir;
    }
    if (parentDev !== dev) return dir;
    dir = parent;
  }
};

/** Appends `-1`, `-2`, … before the extension until the path is free. */
const uniquePath = (destPath: string): string => {
  if (!existsSync(destPath)) return destPath;
  const dir = dirname(destPath);
  const ext = extname(destPath);
  const stem = basename(destPath, ext);
  for (let n = 1; ; n++) {
    const candidate = join(dir, `${stem}-${n}${ext}`);
    if (!existsSync(candidate)) return candidate;
  }
};

/**
 * Moves `filePath` into `<volumeRoot>/.find-dupes-trash/`, keeping its path below the volume
 * root so the original location stays recoverable. Returns the destination path.
 *
 * The move stays on the same volume, so it is a rename — no copying, no cross-device failure.
 */
export const moveToFallbackTrash = (filePath: string, volumeRoot: string): string => {
  const destPath = uniquePath(join(volumeRoot, FALLBACK_TRASH_DIR, relative(volumeRoot, filePath)));
  mkdirSync(dirname(destPath), { recursive: true });
  renameSync(filePath, destPath);
  return destPath;
};

/**
 * Moves a file to the system trash, falling back to a trash directory on its own volume when
 * the volume has none of its own (network shares mounted over SMB/AFP/NFS, most notably).
 *
 * Throws if the system trash fails and either the fallback is disabled or the fallback move
 * fails too; the thrown error names both causes.
 */
export const safeTrash = async (
  filePath: string,
  { fallback, volumeRoot, trashImpl = trash }: SafeTrashOptions,
): Promise<{ path: string; method: TrashMethod; destination?: string }> => {
  try {
    await trashImpl(filePath);
    return { path: filePath, method: 'trash' };
  } catch (trashError) {
    if (!fallback) throw trashError;
    try {
      const destination = moveToFallbackTrash(filePath, volumeRoot ?? findVolumeRoot(filePath));
      return { path: filePath, method: 'fallback', destination };
    } catch (fallbackError) {
      throw new Error(
        `system trash failed (${String(trashError)}) and fallback trash failed (${String(fallbackError)})`,
      );
    }
  }
};
