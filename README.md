# find-dupes

Find duplicate and similar images and videos across a directory tree, then review and delete them through a web UI.

## How it works

1. **Scan** — walks a directory, fingerprints every image/video with one or more strategies, and caches results in a local SQLite database. Re-running a scan is fast: unchanged files reuse cached fingerprints.
2. **Report** — launches a local web server where you can review duplicate groups side-by-side, decide what to keep or delete, and commit the deletions.

## Requirements

- Node.js 20+
- `fpcalc` on `$PATH` — only for the `audio` strategy (part of [Chromaprint](https://acoustid.org/chromaprint)). Optional: if not installed, the strategy is silently skipped.

`ffmpeg` and `ffprobe` are bundled via npm (`ffmpeg-static`, `@ffprobe-installer/ffprobe`) — no separate installation needed.

## Installation

```bash
npm install
npm run build
```

Then either run directly:

```bash
node dist/cli/index.js <command>
```

Or link globally:

```bash
npm link
find-dupes <command>
```

## Commands

### `scan <root-dir>`

Walks `<root-dir>` recursively, fingerprints all images and videos, and saves results to SQLite.

```bash
find-dupes scan /Volumes/Photos
```

**Options:**

| Flag | Default | Description |
|---|---|---|
| `--strategies <list>` | `all` | Comma-separated strategies to run: `exact`, `perceptual`, `metadata`, `audio`, or `all` |
| `--threshold <n>` | `10` | Perceptual Hamming distance threshold (0–64). Lower = stricter matching. |
| `--db <path>` | `<root-dir>/.find-dupes.db` | Path to the SQLite database |

**Examples:**

```bash
# Only exact duplicates, custom DB location
find-dupes scan ~/Photos --strategies exact --db ~/Photos/dupes.db

# Perceptual + exact, stricter threshold
find-dupes scan ~/Photos --strategies exact,perceptual --threshold 5

# All strategies
find-dupes scan ~/Photos --strategies all
```

**Strategies:**

| Name | What it finds |
|---|---|
| `exact` | Byte-for-byte identical files (same SHA-256) |
| `perceptual` | Visually similar images or videos (dHash algorithm) |
| `metadata` | Files with identical dimensions/duration/bitrate |
| `audio` | Videos with the same audio track (Chromaprint/fpcalc) |

### `report`

Starts a local web server to review duplicate groups and commit deletions.

```bash
find-dupes report --db /Volumes/Photos/.find-dupes.db
```

**Options:**

| Flag | Default | Description |
|---|---|---|
| `--db <path>` | `.find-dupes.db` | Path to the SQLite database from a previous scan |
| `--port <n>` | `3000` | Port to listen on |
| `--dry-run` | off | Log what would be deleted without actually deleting |

Then open [http://localhost:3000](http://localhost:3000) in your browser.

## Workflow

```
scan → review in browser → commit deletes
```

The scan is incremental: if you add files to a directory and re-scan, only the new files are fingerprinted. If you add a new strategy (e.g. you install `fpcalc` later), it will run the new strategy on all files without re-running existing ones.

Decisions made in the report UI are saved to the database immediately. The `Commit Deletes` button performs the actual file deletions (or prints a dry-run summary with `--dry-run`).

## Further reading

| File | Description |
|---|---|
| [src/cache/cacheStore.md](src/cache/cacheStore.md) | Why SQLite, WAL mode, and the re-cluster-on-scan design |
| [src/reporter/ui/README.md](src/reporter/ui/README.md) | Svelte 5 UI structure and dev workflow |
