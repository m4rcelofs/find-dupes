import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'src/strategies/fixtures';
mkdirSync(dir, { recursive: true });

// 10x10 red JPEG
await sharp({ create: { width: 10, height: 10, channels: 3, background: { r: 255, g: 0, b: 0 } } })
  .jpeg().toFile(join(dir, 'red-10x10.jpg'));

// Same content, different size — 20x20 red JPEG (for perceptual similarity test)
await sharp({ create: { width: 20, height: 20, channels: 3, background: { r: 255, g: 0, b: 0 } } })
  .jpeg().toFile(join(dir, 'red-20x20.jpg'));

// 10x10 blue PNG
await sharp({ create: { width: 10, height: 10, channels: 3, background: { r: 0, g: 0, b: 255 } } })
  .png().toFile(join(dir, 'blue-10x10.png'));

// 10x10 green WEBP
await sharp({ create: { width: 10, height: 10, channels: 3, background: { r: 0, g: 255, b: 0 } } })
  .webp().toFile(join(dir, 'green-10x10.webp'));

console.log('Fixtures generated in', dir);
