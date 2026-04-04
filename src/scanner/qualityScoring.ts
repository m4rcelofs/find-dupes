import type { FileMetadata } from '../types.js';

export const computeQualityScore = (
  metadata: FileMetadata,
  mimeType: string,
  fileSize: number,
): number => {
  if (mimeType.startsWith('video/')) {
    const resolution = (metadata.width ?? 0) * (metadata.height ?? 0);
    const bitrate = metadata.bitrate ?? 0;
    if (resolution > 0 && bitrate > 0) return resolution * bitrate;
    return fileSize;
  }

  // Image
  const resolution = (metadata.width ?? 0) * (metadata.height ?? 0);
  return resolution > 0 ? resolution : fileSize;
};
