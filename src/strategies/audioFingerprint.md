# audioFingerprint.ts

Fingerprints videos by their audio track using [Chromaprint](https://acoustid.org/chromaprint) (`fpcalc`). Two videos with the same audio fingerprint contain the same audio content.

## Algorithm: Chromaprint

Chromaprint is an audio fingerprinting library developed for the [AcoustID](https://acoustid.org) project. It:

1. Decodes the audio stream to a raw PCM signal.
2. Splits the signal into short overlapping frames and computes a spectrogram.
3. Applies a set of image-filter-like operations on the spectrogram to produce a compact integer array — the "raw fingerprint".

The raw fingerprint (`fpcalc -raw`) is a comma-separated sequence of 32-bit integers. It is stored as-is as the strategy fingerprint string.

## Why audio fingerprinting for video

Two copies of the same video are often re-encoded differently (different resolution, codec, or container) but share the exact same audio track. Audio fingerprinting catches these cases that perceptual video hashing might miss — especially when the visual content is too different in the sampled frames (e.g. a long movie where 4 evenly-spaced frames don't overlap between two slightly different cuts).

## Requirement

`fpcalc` must be installed and on `$PATH`. It is part of the Chromaprint toolkit:

```bash
# macOS
brew install chromaprint

# Ubuntu/Debian
apt install libchromaprint-tools
```

If `fpcalc` is not available, the strategy throws and the error is silently swallowed by the scanner — the scan proceeds without audio fingerprints.

## Supported formats

Same video formats as `perceptualVideo`: MP4, MOV, AVI, MKV, WebM, MPEG. Chromaprint uses `ffmpeg` internally to decode audio, so any format with an audio track that `ffmpeg` supports will work.

## Dependency injection

`runFpcalc` is injectable for testing — tests can pass a mock without requiring `fpcalc` to be installed.
