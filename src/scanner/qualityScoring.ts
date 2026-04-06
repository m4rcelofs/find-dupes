import type { FileMetadata } from '../types.js';

/**
 * Assigns a quality score to a file within a duplicate group. Higher = better copy to keep.
 * Scores are not normalised — only meaningful for comparison within a group.
 *
 * Scoring:
 * - Video with dimensions + bitrate: `width × height × bitrate`
 *   Resolution alone is insufficient — a low-bitrate 1080p can look worse than a high-bitrate 720p.
 * - Video without both: `fileSize` fallback.
 * - Image with dimensions: `width × height` (pixel count is the most reliable quality proxy).
 * - Image without dimensions: `fileSize` fallback.
 *
 * Path depth is applied as a 0.1%-per-level multiplier so that a more deeply nested file
 * (e.g. in an organised album subfolder) wins ties without overriding real quality differences.
 */
export const computeQualityScore = (
  metadata: FileMetadata,
  mimeType: string,
  fileSize: number,
  filePath: string,
): number => {
  const depth = filePath.split('/').filter(Boolean).length;
  const depthMultiplier = 1 + depth * 0.001;

  if (mimeType.startsWith('video/')) {
    const resolution = (metadata.width ?? 0) * (metadata.height ?? 0);
    const bitrate = metadata.bitrate ?? 0;
    if (resolution > 0 && bitrate > 0) return resolution * bitrate * depthMultiplier;
    return fileSize * depthMultiplier;
  }

  // Image
  const resolution = (metadata.width ?? 0) * (metadata.height ?? 0);
  return (resolution > 0 ? resolution : fileSize) * depthMultiplier;
};
