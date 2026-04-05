# metadata.ts

Extracts technical metadata from images and videos (dimensions, duration, bitrate) and produces an MD5 fingerprint of those values.

## What it extracts

| Field | Images | Videos |
|---|---|---|
| `width` | via `sharp` | via `ffprobe` (first video stream) |
| `height` | via `sharp` | via `ffprobe` (first video stream) |
| `bitrate` | — | via `ffprobe` (container format) |
| `duration` | — | via `ffprobe` (container format) |

## Role in the pipeline

The `metadata` strategy is **enrichment-only** — it is not used for grouping duplicates. Its purpose is:

1. **Quality scoring** — `width`, `height`, `bitrate`, and `duration` are used by `qualityScoring.ts` to rank copies within a group.
2. **UI display** — the web UI shows resolution, file size, bitrate, and video length for each file in a group.

The fingerprint (MD5 of `{w, h, d, b}`) is stored in the DB for caching purposes but is never compared between files.

## Why not use the fingerprint for grouping

Two photos of the same subject taken by the same camera at the same settings would have the same metadata fingerprint — but that does not make them duplicates. Metadata equality is too coarse for deduplication.

## Dependencies

- `sharp` for images — synchronous metadata extraction without decoding the full image.
- `fluent-ffmpeg` (`ffprobe`) for videos — parses container metadata without decoding any frames.
