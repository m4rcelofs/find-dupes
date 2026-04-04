import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import type { Strategy, StrategyResult, FileInfo } from '../types.js';

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
