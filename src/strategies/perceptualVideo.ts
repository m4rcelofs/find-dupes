import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import sharp from 'sharp';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Strategy, StrategyResult, FileInfo } from '../types.js';

ffmpeg.setFfmpegPath(ffmpegPath as unknown as string);

/**
 * Number of evenly-spaced frames extracted per video.
 * 4 frames captures opening, two midpoints, and near-end — enough to distinguish
 * different content without slowing scans significantly.
 */
const FRAME_COUNT = 4;

type ExtractFramesFn = (videoPath: string, frameCount: number) => Promise<Buffer[]>;

const defaultExtractFrames: ExtractFramesFn = (videoPath, frameCount) =>
  new Promise((resolve, reject) => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'find-dupes-frames-'));
    ffmpeg(videoPath)
      .on('end', () => {
        try {
          const files = readdirSync(tmpDir).sort();
          const buffers = files.map((f) => readFileSync(join(tmpDir, f)));
          rmSync(tmpDir, { recursive: true, force: true });
          resolve(buffers);
        } catch (e) {
          reject(e);
        }
      })
      .on('error', (err) => {
        rmSync(tmpDir, { recursive: true, force: true });
        reject(err);
      })
      .screenshots({
        count: frameCount,
        folder: tmpDir,
        filename: 'frame-%i.jpg',
        size: '9x8',
      });
  });

/**
 * Compute dHash for a single frame buffer.
 * On sharp failure (corrupt frame, unsupported pixel format), logs a warning and
 * returns an all-zero hash so the overall fingerprint remains usable.
 */
const dHashFromBuffer = async (buf: Buffer): Promise<string> => {
  try {
    const { data } = await sharp(buf)
      .resize(9, 8, { fit: 'fill' })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    let hash = 0n;
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        if (data[row * 9 + col] > data[row * 9 + col + 1]) {
          hash |= 1n << BigInt(row * 8 + col);
        }
      }
    }
    return hash.toString(16).padStart(16, '0');
  } catch (err) {
    console.error('perceptualVideo: failed to dHash frame, using zero hash:', err);
    return '0000000000000000';
  }
};

/**
 * Perceptual video strategy using keyframe dHash.
 *
 * Algorithm:
 * 1. Extract `FRAME_COUNT` evenly-spaced frames via ffmpeg into a temp directory.
 * 2. dHash each frame (same algorithm as `perceptualImage`).
 * 3. Concatenate the per-frame hashes into a single fingerprint.
 *
 * Fingerprint: 64 hex chars = 256 bits (4 frames × 16 chars each).
 * Similarity uses `bits=256` as the denominator in `hammingToSimilarity`.
 *
 * Finds: same video at different resolutions/bitrates, different container formats,
 * re-encoded copies, slightly trimmed versions (if sampled frames overlap).
 * Does not reliably find: heavily edited videos, very short clips (< a few seconds).
 *
 * `extractFrames` is injectable for testing — pass a mock to avoid requiring ffmpeg in CI.
 */
export const createPerceptualVideoStrategy = (
  { extractFrames = defaultExtractFrames }: { extractFrames?: ExtractFramesFn } = {},
): Strategy => ({
  name: 'perceptualVideo',
  supportedMimeTypes: ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska', 'video/webm', 'video/mpeg'],

  analyze: async (file: Pick<FileInfo, 'path' | 'mimeType'>): Promise<StrategyResult> => {
    const frames = await extractFrames(file.path, FRAME_COUNT);
    const hashes = await Promise.all(frames.map(dHashFromBuffer));
    return { fingerprint: hashes.join('') };
  },
});
