import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import { path as ffprobePath } from '@ffprobe-installer/ffprobe';
import exifr from 'exifr';
import { createHash } from 'node:crypto';
import type { Strategy, StrategyResult, FileMetadata, FileInfo } from '../types.js';

ffmpeg.setFfprobePath(ffprobePath);

// RAW camera MIME types (as remapped by fileWalker) — decoded via exifr, not sharp.
const RAW_MIME_TYPES = new Set([
  'image/x-nikon-nef', 'image/x-nikon-nrw',
  'image/x-canon-cr2', 'image/x-canon-cr3',
  'image/x-sony-arw',  'image/x-adobe-dng',
  'image/x-olympus-orf', 'image/x-panasonic-rw2',
  'image/x-fuji-raf',  'image/x-pentax-pef',
  'image/x-samsung-srw', 'image/x-sigma-x3f',
  'image/x-minolta-mrw', 'image/x-leica-rwl',
  'image/x-hasselblad-3fr', 'image/x-mamiya-mef',
  'image/x-epson-erf', 'image/x-kodak-kdc', 'image/x-kodak-dcr',
]);

const extractImageMetadata = async (path: string): Promise<FileMetadata> => {
  const meta = await sharp(path).metadata();
  return {
    width: meta.width,
    height: meta.height,
  };
};

/**
 * Extracts dimensions from RAW camera files via exifr EXIF tags.
 * Sharp cannot decode RAW formats without LibRaw, so we read the embedded
 * EXIF metadata instead. Dimensions reflect the full sensor resolution.
 */
const extractRawMetadata = async (path: string): Promise<FileMetadata> => {
  const tags = await exifr.parse(path, {
    pick: ['ImageWidth', 'ImageHeight', 'ExifImageWidth', 'ExifImageHeight',
           'PixelXDimension', 'PixelYDimension'],
  }) as Record<string, number> | undefined;

  const width = tags?.ImageWidth ?? tags?.ExifImageWidth ?? tags?.PixelXDimension;
  const height = tags?.ImageHeight ?? tags?.ExifImageHeight ?? tags?.PixelYDimension;
  return { width, height };
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
 * Extracts: width, height (images via sharp; RAW files via exifr EXIF tags;
 * videos via ffprobe first video stream), bitrate and duration (videos via ffprobe).
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
      : RAW_MIME_TYPES.has(file.mimeType)
        ? await extractRawMetadata(file.path)
        : await extractImageMetadata(file.path);

    return { fingerprint: fingerprintFromMetadata(metadata), metadata };
  },
});
