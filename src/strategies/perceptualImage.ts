import sharp from 'sharp';
import type { Strategy, StrategyResult, FileInfo } from '../types.js';

export const hammingDistance = (a: string, b: string): number => {
  let xor = BigInt('0x' + a) ^ BigInt('0x' + b);
  let count = 0;
  while (xor > 0n) {
    count += Number(xor & 1n);
    xor >>= 1n;
  }
  return count;
};

export const hammingToSimilarity = (distance: number, bits = 64): number =>
  ((bits - distance) / bits) * 100;

const computeDHash = async (imagePath: string): Promise<string> => {
  const { data } = await sharp(imagePath)
    .resize(9, 8, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let hash = 0n;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const left = data[row * 9 + col];
      const right = data[row * 9 + col + 1];
      if (left > right) hash |= 1n << BigInt(row * 8 + col);
    }
  }
  return hash.toString(16).padStart(16, '0');
};

export const createPerceptualImageStrategy = (): Strategy => ({
  name: 'perceptualImage',
  supportedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/tiff', 'image/heic', 'image/heif'],

  analyze: async (file: Pick<FileInfo, 'path' | 'mimeType'>): Promise<StrategyResult> => ({
    fingerprint: await computeDHash(file.path),
  }),
});
