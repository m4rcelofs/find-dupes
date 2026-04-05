# reportServer.ts

Express HTTP server that exposes the database to the web UI and handles file deletions.

## Endpoints

### `GET /api/groups`

Returns all **undecided** duplicate groups with their members. Each group includes full file info and metadata for every member, ordered by quality score descending (best copy first).

Used by the UI on load to populate the review queue.

### `GET /api/groups/all`

Same as `/api/groups` but includes groups that have already been decided. Useful for reviewing past decisions.

### `POST /api/groups/:id/action`

Saves a decision for a group.

**Body:** `{ decisions: Record<string, Decision> }` — keys are string-encoded file IDs, values are `'keep'`, `'delete'`, or `'skip'`.

Overwrites any previous decision for the group (re-deciding is always allowed).

### `POST /api/commit`

Executes all pending deletions — files across all decided groups where the decision is `'delete'`.

In `--dry-run` mode, returns `{ dryRun: true, wouldDelete: string[] }` without touching the filesystem.

In live mode, attempts to `unlink` each file and returns `{ dryRun: false, deleted: string[], errors: { path, error }[] }`. Failures are reported per-file rather than aborting the whole batch.

### `GET /api/media?path=<absolute-path>`

Serves a file directly from the filesystem for use as `<img src>` or `<video src>` in the browser. Only serves files that exist in the database — arbitrary paths are rejected with 404. Non-absolute paths return 400.

### Static files

If `src/reporter/ui/dist/` exists (i.e. the UI has been built), it is served as static files at `/`. This is how the browser loads the Svelte app.

## Security note

The server is intended for local use only. `/api/media` is restricted to database-known paths to prevent arbitrary file access, but the server does not implement authentication. Do not expose it on a public network interface.
