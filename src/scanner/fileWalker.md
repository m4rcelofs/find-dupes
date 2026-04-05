# fileWalker.ts

Recursively walks a directory and calls a callback for each supported image or video file.

## Behaviour

- **Dot files and dot directories are skipped** — `.DS_Store`, `.Trash`, `.find-dupes.db`, hidden directories.
- **Symlinks are skipped** — detected via `lstat` (which does not follow symlinks). Following symlinks risks infinite loops and processing files outside the intended root.
- **Only image and video files are yielded** — MIME type is inferred from the file extension using `mime-types`. Files with unrecognised or non-media extensions are ignored.
- `size` and `mtime` are read from the same `lstat` call used for symlink detection, avoiding a redundant `stat` syscall.

## Supported MIME prefixes

`image/*` and `video/*`. Any extension that `mime-types` resolves to one of these prefixes is included. This covers JPEG, PNG, WebP, HEIC, GIF, TIFF, MP4, MOV, AVI, MKV, WebM, MPEG, and more.
