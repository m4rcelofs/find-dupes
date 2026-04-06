# cacheStore — Why SQLite

Scans of large photo libraries (hundreds of GB, tens of thousands of files) take a long time. Fingerprinting a single video can take several seconds. SQLite provides a durable, zero-dependency cache so that:

- Re-scanning after adding a few files only processes the new files.
- Adding a new strategy runs only on files that don't yet have a result for it.
- The report UI can query results without re-running any analysis.

WAL mode (`PRAGMA journal_mode = WAL`) is enabled so the report server can read while a scan is writing. Foreign keys are enforced (`PRAGMA foreign_keys = ON`) with `ON DELETE CASCADE` so orphaned rows are cleaned up automatically.

Match groups are rebuilt from scratch on every scan (per strategy) rather than incrementally updated. This keeps the grouping logic simple and correct — fingerprints change when files change, and a full re-cluster is fast once the fingerprints are cached.
