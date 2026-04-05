# scanner.ts

Orchestrates the full scan pipeline. Takes a root directory, a cache store, and a list of strategies; emits progress events; produces match groups in the database.

## Pipeline

### Step 1 — Walk

Calls `walkDirectory` to collect all image/video files currently on disk into `liveFiles`.

### Step 2 — Mark deleted

Calls `store.markDeletedExcept(livePaths)` to soft-delete any file in the DB that no longer exists on disk. This keeps the DB consistent after files have been moved or deleted externally.

### Step 3 — Fingerprint

For each live file:

- **Cache hit** (size and mtime unchanged): only runs strategies that don't yet have a result for this file. This handles the case where a new strategy was added since the last scan.
- **Cache miss** (new file or file changed): invalidates old strategy results, upserts the file record, then runs all applicable strategies.

Strategy failures are swallowed silently. This is intentional — `fpcalc` may not be installed, a video may be corrupt, etc. A failed strategy simply produces no result for that file.

### Steps 4 & 5 — Group and score

For each *grouping* strategy (exact hash, perceptual image, perceptual video, audio fingerprint):

1. Clears previous match groups for that strategy.
2. Fetches all strategy results (excluding deleted files).
3. Clusters them — exact grouping for `exactHash`, perceptual clustering for the rest.
4. Inserts each cluster as a `match_group`, then inserts each file as a `match_group_member` with a quality score.

The `metadata` strategy is excluded from grouping — it is enrichment-only, used to supply quality scores and UI display data, not to identify duplicates.

## Strategy applicability

`strategyApplies` checks `strategy.supportedMimeTypes` against a file's MIME type, handling both exact matches (`image/jpeg`) and wildcard patterns (`image/*`).

## `GROUPING_STRATEGY_NAMES`

A set of strategy names that produce match groups. Adding a new grouping strategy requires adding its name here.
