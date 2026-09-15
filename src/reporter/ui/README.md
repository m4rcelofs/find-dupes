# Report UI

Svelte 5 single-page application for reviewing duplicate groups and committing deletions.

## Stack

- **Svelte 5** with runes (`$state`, `$derived`, `$props`) — no stores, no legacy reactive syntax
- **Vite** for bundling
- **bits-ui** available as a component library (not yet used — baseline components are hand-written)

## Structure

```
src/reporter/ui/
  index.html           # Entry point, dark background, mounts #app
  vite.config.ts       # Svelte plugin, /api proxy to localhost:3000
  src/
    main.ts            # Mounts App component
    App.svelte         # Root: loads groups, paginates review, commit button
    lib/
      api.ts           # Typed fetch wrappers for all API endpoints
      GroupView.svelte # One duplicate group: all members side by side
      FileCard.svelte  # One file: preview, metadata, Keep/Delete buttons
```

## Building

```bash
npm run build:ui
```

Output goes to `src/reporter/ui/dist/`, which the Express server serves as static files.

## Development

```bash
# In one terminal: start the report server
find-dupes report --db /path/to/.find-dupes.db --dry-run

# In another terminal: start the Vite dev server (proxies /api to port 3000)
npm run dev:ui
```

Then open the Vite dev server URL (default: `http://localhost:5173`). Changes to Svelte files hot-reload instantly.

## Component overview

### `App.svelte`

Loads all undecided groups from `GET /api/groups` on mount and shows the head of the list. Every decided or skipped group gains a `report_actions` row and is excluded by the server, so a decision re-fetches the list and the next group becomes the head — there is no cursor to advance. The `{#key currentGroup.id}` block around `GroupView` forces it to remount for each new group, resetting its local decisions state cleanly.

On a network volume `GET /api/groups` takes seconds, so a `loading` flag drives a spinner for the initial load and for the re-fetch after each decision; a `decidedAny` flag tells "All groups reviewed." apart from "No duplicate groups found.", since both leave the list empty. During a commit the button disables and the status line shows live progress polled from `GET /api/pending-count` once a second — the commit marks each file deleted as it trashes it, so the pending count doubles as a progress signal.

A filter bar of per-strategy checkboxes narrows the review queue. It is derived from the loaded groups (so only strategies that actually produced groups appear, with live counts) and filters client-side — `GroupWithMembers` already carries `strategy`, so toggling needs no refetch. The selection persists in `localStorage` under `find-dupes.strategyFilter` and is reconciled against what the current database offers on load. Committing deliberately ignores the filter: the counter and the button cover every pending delete, including groups currently hidden.

### `GroupView.svelte`

Receives a `GroupWithMembers` and renders all members in a CSS grid (`repeat(N, 1fr)` columns). Tracks a `decisions` record locally. **Skip** records `'skip'` for all members and advances. **Confirm** is disabled until at least one decision is made; on click, POSTs to `/api/groups/:id/action` and advances. Keyboard shortcuts (Enter / `k` / `s` / `p`) are bound on `window`, so they ignore keystrokes aimed at any form control and any keystroke carrying a modifier — otherwise focusing a filter checkbox, or pressing ⌘S, would decide the group behind it.

**Play All** (`p`) plays the group's videos in step so near-identical clips can be compared at the same moment: at most three at once (two groups in the working database have 190 and 339 members), started together, scrub-synced, and paused together. Nothing is unmuted. A slot frees only when the user clicks Delete on a playing card — the pre-marked defaults are a recommendation, not a viewing choice — and the next copy starts at the timestamp its neighbours are already at. `playback.ts` holds the pure window selection; the component drives the elements, found by `data-file-id` under the cards container.

### `FileCard.svelte`

Displays one file. Images use `<img>` with lazy loading. Videos use `<video controls>` — playable inline if the browser supports the codec. Metadata (resolution, size, bitrate, duration) is shown when available. The `isBest` prop (set by `GroupView` based on `qualityScore`) shows a "Best" badge on the recommended copy.

### `api.ts`

Typed wrappers around `fetch`. `mediaUrl(path)` produces a `/api/media?path=...` URL that the Express server validates against the database before serving.
