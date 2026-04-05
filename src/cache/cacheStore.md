# cacheStore.ts

SQLite-backed persistence layer. All database access goes through this module — nothing else touches the DB directly.

## Why SQLite

Scans of large photo libraries (hundreds of GB, tens of thousands of files) take a long time. Fingerprinting a single video can take several seconds. SQLite provides a durable, zero-dependency cache so that:

- Re-scanning after adding a few files only processes the new files.
- Adding a new strategy runs only on files that don't yet have a result for it.
- The report UI can query results without re-running any analysis.

WAL mode (`PRAGMA journal_mode = WAL`) is enabled so the report server can read while a scan is writing. Foreign keys are enforced (`PRAGMA foreign_keys = ON`) with `ON DELETE CASCADE` so orphaned rows are cleaned up automatically.

## Schema

```
files
  id, path (UNIQUE), size, mtime, mime_type, scanned_at, deleted

strategy_results
  id, file_id → files, strategy, fingerprint, metadata_json
  UNIQUE(file_id, strategy)

match_groups
  id, strategy, representative_fingerprint, similarity_score, created_at

match_group_members
  id, group_id → match_groups, file_id → files, quality_score

report_actions
  id, group_id (UNIQUE) → match_groups, decisions_json, decided_at
```

### `files`

One row per discovered file. `deleted = 1` for files no longer on disk (soft delete). Size and mtime are used as a cheap cache-validity check before re-fingerprinting.

### `strategy_results`

One row per (file, strategy) pair. `UNIQUE(file_id, strategy)` means upserts are safe — re-running a strategy on a file overwrites the old result. `metadata_json` stores the `FileMetadata` blob used for display and quality scoring.

### `match_groups` / `match_group_members`

Rebuilt from scratch on every scan (per strategy). Groups are not persisted between scans incrementally — they are cleared and recomputed from the current fingerprint set. `quality_score` on members is computed at grouping time and stored for fast retrieval in the UI.

### `report_actions`

Stores user decisions. `UNIQUE(group_id)` ensures there is only one decision record per group — re-deciding a group overwrites the previous decision via `ON CONFLICT DO UPDATE`. `decisions_json` is a `Record<string, Decision>` keyed by string-encoded file IDs.

## Key methods

### `upsertFile`

Uses a single `INSERT ... ON CONFLICT DO UPDATE ... RETURNING id` statement. This atomically inserts a new file or updates an existing one's size/mtime, and returns the row ID without a separate SELECT.

### `markDeletedExcept(livePaths)`

Called at the start of each scan with the set of paths actually found on disk. Any file in the DB not in `livePaths` is marked `deleted = 1`. Runs inside a transaction to keep the update atomic.

### `invalidateFile(fileId)`

Deletes all `strategy_results` rows for a file. Called when a file's size or mtime has changed, so its cached fingerprints are no longer valid.

### `getGroupsWithMembers(undecidedOnly?)`

Joins `match_groups`, `match_group_members`, `files`, and `strategy_results` in one query per group. Members are ordered by `quality_score DESC` so the best copy appears first. When `undecidedOnly = true`, groups with a `report_actions` record are excluded — this is what the report UI uses to show only unreviewed groups.

### `getPendingDeletes`

Finds all files across all decided groups where the user's decision was `'delete'`, filtering out soft-deleted files (`deleted = 0` only). Returns file paths ready for `unlink`.

## `CacheStore` type

Exported as `ReturnType<typeof createCacheStore>` rather than a manually maintained interface, so the type stays in sync with the implementation automatically.
