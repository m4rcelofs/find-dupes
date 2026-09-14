import express, { type Express } from 'express';
import { safeTrash, FALLBACK_TRASH_DIR } from './safeTrash.js';
import { existsSync } from 'node:fs';
import { join, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CacheStore } from '../cache/cacheStore.js';
import type { Decision } from '../types.js';

const UI_DIST = join(dirname(fileURLToPath(import.meta.url)), 'ui/dist');

type ReportServerOptions = {
  store: CacheStore;
  dryRun: boolean;
  /** Move files to `.find-dupes-trash/` on their own volume when it has no system trash. */
  trashFallback?: boolean;
  /** Override the system trash call. Test seam. */
  trashImpl?: (path: string) => Promise<unknown>;
};

/**
 * Creates the Express report server.
 *
 * Routes:
 * - `GET  /api/groups`         — undecided groups with members, ordered by quality score DESC.
 * - `GET  /api/groups/all`     — all groups including already-decided ones.
 * - `POST /api/groups/:id/action` — save `{ decisions: Record<string, Decision> }` for a group.
 *   Overwrites any previous decision. Returns 400 for invalid group ID or missing body.
 * - `POST /api/commit`         — move all files marked 'delete' to the system trash.
 *   In dry-run mode returns `{ dryRun: true, wouldDelete: string[] }` without touching disk.
 *   In live mode returns
 *   `{ dryRun: false, deleted: string[], fallback: { path, destination }[], errors: { path, error }[] }`;
 *   failures are per-file, not batch-aborting. Files on volumes with no system trash (network
 *   shares) go to `.find-dupes-trash/` on that volume unless `trashFallback` is false.
 * - `GET  /api/media?path=...` — serve a file for `<img>`/`<video>` preview. Only serves paths
 *   known to the database (arbitrary paths return 404; non-absolute paths return 400).
 *
 * Serves the built Svelte UI from `ui/dist/` as static files if the directory exists.
 *
 * Security: intended for local use only. `/api/media` is restricted to DB-known paths,
 * but the server has no authentication. Do not expose on a public network interface.
 */
export const createReportServer = ({
  store,
  dryRun,
  trashFallback = true,
  trashImpl,
}: ReportServerOptions): Express => {
  const app = express();
  app.use(express.json());

  // Serve built Svelte UI if available
  if (existsSync(UI_DIST)) {
    app.use(express.static(UI_DIST));
  }

  app.get('/api/groups', (_req, res) => {
    res.json(store.getGroupsWithMembers(true));
  });

  app.get('/api/groups/all', (_req, res) => {
    res.json(store.getGroupsWithMembers(false));
  });

  app.post('/api/groups/:id/action', (req, res) => {
    const groupId = parseInt(req.params.id, 10);
    if (isNaN(groupId)) {
      res.status(400).json({ error: 'invalid group id' });
      return;
    }
    const { decisions } = req.body as { decisions: Record<string, Decision> };
    if (!decisions || typeof decisions !== 'object') {
      res.status(400).json({ error: 'decisions required' });
      return;
    }
    store.saveReportAction(groupId, decisions);
    res.json({ ok: true });
  });

  app.get('/api/pending-count', (_req, res) => {
    res.json({ count: store.getPendingDeletes().length });
  });

  app.post('/api/commit', async (_req, res) => {
    const pending = store.getPendingDeletes();
    if (dryRun) {
      res.json({ dryRun: true, wouldDelete: pending });
      return;
    }
    const deleted: string[] = [];
    const fallback: Array<{ path: string; destination: string }> = [];
    const errors: Array<{ path: string; error: string }> = [];
    for (const filePath of pending) {
      try {
        const result = await safeTrash(filePath, { fallback: trashFallback, trashImpl });
        store.markFileDeletedByPath(filePath);
        deleted.push(filePath);
        if (result.method === 'fallback' && result.destination) {
          fallback.push({ path: filePath, destination: result.destination });
        }
      } catch (e) {
        errors.push({ path: filePath, error: e instanceof Error ? e.message : String(e) });
      }
    }
    res.json({ dryRun: false, deleted, fallback, fallbackDir: FALLBACK_TRASH_DIR, errors });
  });

  // Serve media files for preview (browser fetches these as <img src> / <video src>)
  app.get('/api/media', (req, res) => {
    const filePath = req.query.path as string;
    if (!filePath || !isAbsolute(filePath)) {
      res.status(400).send('Absolute path required');
      return;
    }
    const file = store.getFileByPath(filePath);
    if (!file) {
      res.status(404).send('Not found');
      return;
    }
    res.sendFile(filePath);
  });

  return app;
};
