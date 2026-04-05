# exactHash.ts

Fingerprints files using SHA-256 of their full content. Two files with the same fingerprint are byte-for-byte identical.

## Why SHA-256

SHA-256 is collision-resistant in practice and fast enough for streaming large files. The hash is computed by streaming the file through Node's `crypto.createHash`, so memory usage is constant regardless of file size.

## What it finds

Exact duplicates: same photo saved twice, a file copied to a different folder, a re-download of the same video. It does not find the same image at different resolutions or with different compression — use `perceptualImage` for that.

## Similarity score

Always 100 — exact duplicates are identical by definition.
