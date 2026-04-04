import express, { type Express } from 'express';
import { unlink } from 'node:fs/promises';
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
        await unlink(filePath);
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
