import express, { type Express } from 'express';
import trash from 'trash';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CacheStore } from '../cache/cacheStore.js';
import type { Decision } from '../types.js';

const UI_DIST = join(fileURLToPath(import.meta.url), '../../reporter/ui/dist');

type ReportServerOptions = {
  store: CacheStore;
  dryRun: boolean;
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
 *   In live mode returns `{ dryRun: false, deleted: string[], errors: { path, error }[] }`;
 *   failures are per-file, not batch-aborting.
 * - `GET  /api/media?path=...` — serve a file for `<img>`/`<video>` preview. Only serves paths
 *   known to the database (arbitrary paths return 404; non-absolute paths return 400).
 *
 * Serves the built Svelte UI from `ui/dist/` as static files if the directory exists.
 *
 * Security: intended for local use only. `/api/media` is restricted to DB-known paths,
 * but the server has no authentication. Do not expose on a public network interface.
 */
export const createReportServer = ({ store, dryRun }: ReportServerOptions): Express => {
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

  app.post('/api/commit', async (_req, res) => {
    const pending = store.getPendingDeletes();
    if (dryRun) {
      res.json({ dryRun: true, wouldDelete: pending });
      return;
    }
    const deleted: string[] = [];
    const errors: Array<{ path: string; error: string }> = [];
    for (const filePath of pending) {
      try {
        await trash(filePath);
        deleted.push(filePath);
      } catch (e) {
        errors.push({ path: filePath, error: String(e) });
      }
    }
    res.json({ dryRun: false, deleted, errors });
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
