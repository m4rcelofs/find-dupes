import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import { createHash } from 'node:crypto';
import type { Strategy, StrategyResult, FileMetadata, FileInfo } from '../types.js';

const extractImageMetadata = async (path: string): Promise<FileMetadata> => {
  const meta = await sharp(path).metadata();
  return {
    width: meta.width,
    height: meta.height,
  };
};

const extractVideoMetadata = (path: string): Promise<FileMetadata> =>
  new Promise((resolve, reject) => {
    ffmpeg.ffprobe(path, (err, data) => {
      if (err) return reject(err);
      const videoStream = data.streams.find((s) => s.codec_type === 'video');
      const format = data.format;
      resolve({
        width: videoStream?.width ?? undefined,
        height: videoStream?.height ?? undefined,
        bitrate: format.bit_rate ? Math.round(format.bit_rate) : undefined,
        duration: format.duration ?? undefined,
      });
    });
  });

const fingerprintFromMetadata = (meta: FileMetadata): string =>
  createHash('md5')
    .update(JSON.stringify({ w: meta.width, h: meta.height, d: meta.duration, b: meta.bitrate }))
    .digest('hex');

/**
 * Metadata extraction strategy — enrichment only, not used for grouping.
 *
 * Extracts: width, height (images via sharp; videos via ffprobe first video stream),
 * bitrate and duration (videos via ffprobe container format).
 *
 * Purpose:
 * - Quality scoring: width/height/bitrate/duration feed `computeQualityScore` to rank
 *   copies within a duplicate group.
 * - UI display: the web UI shows resolution, bitrate, and video length per file.
 *
 * The MD5 fingerprint of the extracted values is stored for caching but never compared
 * between files. Metadata equality is too coarse for deduplication — two photos taken
 * by the same camera at the same settings would match, but they are not duplicates.
 */
export const createMetadataStrategy = (): Strategy => ({
  name: 'metadata',
  supportedMimeTypes: ['image/*', 'video/*'],

  analyze: async (file: Pick<FileInfo, 'path' | 'mimeType'>): Promise<StrategyResult> => {
    const metadata = file.mimeType.startsWith('video/')
      ? await extractVideoMetadata(file.path)
      : await extractImageMetadata(file.path);

    return { fingerprint: fingerprintFromMetadata(metadata), metadata };
  },
});
