# perceptualImage.ts

Fingerprints images using the **dHash** (difference hash) algorithm. Two images with a small Hamming distance between their hashes are perceptually similar — they look alike to a human eye even if their bytes differ.

## Algorithm: dHash

1. **Resize** the image to 9×8 pixels using `sharp`. The unusual width (9 rather than 8) is intentional: each row yields 8 comparisons between adjacent pixels.
2. **Grayscale** — colour information is discarded. Perceptual similarity is about structure, not colour.
3. **Compare adjacent pixels** — for each of the 8 rows, compare each pixel to its right neighbour. Set the corresponding bit to 1 if the left pixel is brighter.
4. **Encode** the resulting 64-bit integer as a 16-character hex string.

The result is a compact fingerprint that is robust to:
- JPEG re-compression artifacts
- Minor colour adjustments (brightness, contrast, saturation)
- Slight crops or resizes
- Format conversion (PNG → JPEG)

It is *not* robust to large crops, rotations, or flips.

## Hamming distance

Similarity between two dHash fingerprints is measured by Hamming distance — the number of bit positions where the fingerprints differ. A distance of 0 means identical hashes; a distance of 10 out of 64 bits means ~85% similar.

The default threshold of 10 (configurable via `--threshold`) is a practical starting point for catching near-identical photos while avoiding false positives between different subjects.

## Supported formats

JPEG, PNG, WebP, GIF, TIFF, HEIC, HEIF — anything `sharp` can decode.

## Exported utilities

`hammingDistance` and `hammingToSimilarity` are exported and reused by `grouping.ts` and `perceptualVideo.ts`.
