import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import type { Strategy, StrategyResult, FileInfo } from '../types.js';

/**
 * Fingerprints files using SHA-256 of their full content.
 * Two files with the same fingerprint are byte-for-byte identical.
 *
 * SHA-256 is collision-resistant in practice and fast enough for streaming large files.
 * Content is streamed through Node's crypto pipeline — memory usage stays constant
 * regardless of file size. Similarity score is always 100.
 *
 * Finds: exact duplicates — same photo saved twice, file copied to another folder,
 * re-download of the same video. Does not find the same image at different resolutions
 * or compression levels; use `perceptualImage` for that.
 */
export const createExactHashStrategy = (): Strategy => ({
  name: 'exactHash',
  supportedMimeTypes: ['image/*', 'video/*'],

  analyze: (file: Pick<FileInfo, 'path' | 'mimeType'>): Promise<StrategyResult> =>
    new Promise((resolve, reject) => {
      const hash = createHash('sha256');
      const stream = createReadStream(file.path);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve({ fingerprint: hash.digest('hex') }));
      stream.on('error', reject);
    }),
});
