# types.ts

Shared TypeScript types used across the entire codebase. Every other module imports from here rather than defining its own shapes.

## Core types

### `FileInfo`

Represents a file as stored in the database. `mtime` is milliseconds since epoch (from `fs.lstat`). `deleted` is a soft-delete flag — files that disappear between scans are marked deleted rather than removed from the DB, so their fingerprints remain available for historical reference.

### `FileMetadata`

Optional enrichment extracted by the `metadata` strategy. All fields are optional because not all files have all properties (e.g. images have no `duration`).

### `Strategy`

The plugin interface. Every fingerprinting strategy implements this:

```ts
type Strategy = {
  name: string;
  supportedMimeTypes: string[];
  analyze: (file: Pick<FileInfo, 'path' | 'mimeType'>) => Promise<StrategyResult>;
};
```

`supportedMimeTypes` accepts both exact types (`image/jpeg`) and wildcard patterns (`image/*`, `video/*`). The scanner checks these before calling `analyze`.

`analyze` returns a `fingerprint` string (format is strategy-specific) and optionally `metadata` (used for quality scoring and display, not for grouping).

### `MatchGroup` / `GroupWithMembers`

A group of files identified as duplicates or near-duplicates by one strategy. Groups use a cluster model — all matching files are in one group together, not pairwise pairs. `similarityScore` is 0–100 where 100 means identical.

### `Decision`

`'keep' | 'delete' | 'skip'`. Recorded per file within a group when the user reviews it. `skip` means "I saw this group but chose not to act on it now" — the group will not reappear in the undecided queue.

### `ScanProgressEvent`

A discriminated union emitted during a scan:
- `{ type: 'file', path, current, total }` — emitted for each file processed
- `{ type: 'groups', count }` — emitted once at the end with the total number of duplicate groups found
