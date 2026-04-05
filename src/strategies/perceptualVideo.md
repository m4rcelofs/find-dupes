# perceptualVideo.ts

Fingerprints videos by extracting keyframes and computing a dHash for each. The full fingerprint is the concatenation of per-frame hashes.

## Algorithm

1. **Extract frames** — uses `ffmpeg` (via `fluent-ffmpeg`) to extract `FRAME_COUNT = 4` evenly-spaced frames from the video. Each frame is saved as a 9×8 JPEG into a temporary directory and read into memory, then the temp directory is deleted.
2. **dHash each frame** — the same dHash algorithm used for images (see [perceptualImage.md](perceptualImage.md)): resize to 9×8, grayscale, compare adjacent pixels, encode as 16-char hex.
3. **Concatenate** — the four 16-char hashes are joined into a single 64-char fingerprint.

## Why 4 frames

Four frames distributed across the video captures the rough "shape" of the content (opening, two midpoints, near-end) without being computationally expensive. A single frame would miss videos that share an intro but diverge later; too many frames would slow down scanning significantly.

## Fingerprint length

64 hex characters = 256 bits. This is 4× longer than an image dHash, so the Hamming distance for "same video" will still be small in absolute terms, but the similarity score uses `bits = 256` as the denominator (see `hammingToSimilarity`).

## What it finds

- The same video encoded at different resolutions or bitrates
- The same video in different container formats (MP4 vs MOV vs MKV)
- Re-encoded copies with different codecs
- Videos that were slightly trimmed at the start or end (if the shared frames land in the common section)

It does not reliably find videos that are heavily edited, have different content in the sampled frames, or are very short (< a few seconds).

## Error handling

If `sharp` fails to dHash a frame (corrupt frame, unsupported pixel format), that frame's hash is replaced with `'0000000000000000'` (all-zero) and a warning is logged. The scan continues.

## Dependency injection

`extractFrames` is injectable for testing — tests pass a mock that returns real PNG buffers without requiring `ffmpeg` to be available in CI.
