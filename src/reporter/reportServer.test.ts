import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createCacheStore } from '../cache/cacheStore.js';
import { createReportServer } from './reportServer.js';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

let store: ReturnType<typeof createCacheStore>;
let app: ReturnType<typeof createReportServer>;

beforeEach(() => {
  store = createCacheStore(':memory:');
  app = createReportServer({ store, dryRun: true });
});

afterEach(() => store.close());

const seedGroup = () => {
  const id1 = store.upsertFile({ path: '/a.jpg', size: 1000, mtime: 1, mimeType: 'image/jpeg' });
  const id2 = store.upsertFile({ path: '/b.jpg', size: 800, mtime: 1, mimeType: 'image/jpeg' });
  const groupId = store.insertMatchGroup('exactHash', 'abc123', 100);
  store.insertMatchGroupMember(groupId, id1, 1000);
  store.insertMatchGroupMember(groupId, id2, 800);
  return { id1, id2, groupId };
};

describe('GET /api/groups', () => {
  it('returns undecided groups with members', async () => {
    const { groupId } = seedGroup();
    const res = await request(app).get('/api/groups');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(groupId);
    expect(res.body[0].members).toHaveLength(2);
  });

  it('excludes decided groups', async () => {
    const { groupId, id1, id2 } = seedGroup();
    store.saveReportAction(groupId, { [id1]: 'keep', [id2]: 'delete' });
    const res = await request(app).get('/api/groups');
    expect(res.body).toHaveLength(0);
  });
});

describe('POST /api/groups/:id/action', () => {
  it('saves decisions and returns 200', async () => {
    const { groupId, id1, id2 } = seedGroup();
    const res = await request(app)
      .post(`/api/groups/${groupId}/action`)
      .send({ decisions: { [id1]: 'keep', [id2]: 'delete' } });
    expect(res.status).toBe(200);
    const groups = await request(app).get('/api/groups');
    expect(groups.body).toHaveLength(0);
  });

  it('returns 400 for non-numeric group id', async () => {
    const res = await request(app).post('/api/groups/abc/action').send({ decisions: {} });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/groups/all', () => {
  it('includes decided groups', async () => {
    const { groupId, id1, id2 } = seedGroup();
    store.saveReportAction(groupId, { [String(id1)]: 'keep', [String(id2)]: 'delete' });
    const undecided = await request(app).get('/api/groups');
    expect(undecided.body).toHaveLength(0);
    const all = await request(app).get('/api/groups/all');
    expect(all.body).toHaveLength(1);
  });
});

describe('POST /api/commit', () => {
  it('returns dry-run list of files to delete', async () => {
    const { groupId, id1, id2 } = seedGroup();
    store.saveReportAction(groupId, { [String(id1)]: 'keep', [String(id2)]: 'delete' });
    const res = await request(app).post('/api/commit');
    expect(res.status).toBe(200);
    expect(res.body.dryRun).toBe(true);
    expect(res.body.wouldDelete).toContain('/b.jpg');
  });

  it('actually deletes files when dryRun is false', async () => {
    const tmpDir = '/tmp/find-dupes-commit-test';
    mkdirSync(tmpDir, { recursive: true });
    const fileToDelete = join(tmpDir, 'to-delete.jpg');
    writeFileSync(fileToDelete, 'fake image content');

    const liveStore = createCacheStore(':memory:');
    const liveApp = createReportServer({ store: liveStore, dryRun: false });
    const id1 = liveStore.upsertFile({ path: join(tmpDir, 'keep.jpg'), size: 1000, mtime: 1, mimeType: 'image/jpeg' });
    const id2 = liveStore.upsertFile({ path: fileToDelete, size: 800, mtime: 1, mimeType: 'image/jpeg' });
    const groupId = liveStore.insertMatchGroup('exactHash', 'abc123', 100);
    liveStore.insertMatchGroupMember(groupId, id1, 1000);
    liveStore.insertMatchGroupMember(groupId, id2, 800);
    liveStore.saveReportAction(groupId, { [String(id1)]: 'keep', [String(id2)]: 'delete' });

    const res = await request(liveApp).post('/api/commit');
    expect(res.status).toBe(200);
    expect(res.body.dryRun).toBe(false);
    expect(res.body.deleted).toContain(fileToDelete);
    expect(res.body.errors).toEqual([]);
    liveStore.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reports per-file errors and keeps failed files pending', async () => {
    // Reproduces a NAS share: the system trash refuses the file (no trash on that volume).
    const tmpDir = '/tmp/find-dupes-commit-error-test';
    mkdirSync(tmpDir, { recursive: true });
    const fileToDelete = join(tmpDir, 'to-delete.jpg');
    writeFileSync(fileToDelete, 'fake image content');

    const liveStore = createCacheStore(':memory:');
    const liveApp = createReportServer({
      store: liveStore,
      dryRun: false,
      trashFallback: false,
      trashImpl: async () => {
        throw new Error('the volume “NAS” doesn’t have one.');
      },
    });
    const id1 = liveStore.upsertFile({ path: join(tmpDir, 'keep.jpg'), size: 1000, mtime: 1, mimeType: 'image/jpeg' });
    const id2 = liveStore.upsertFile({ path: fileToDelete, size: 800, mtime: 1, mimeType: 'image/jpeg' });
    const groupId = liveStore.insertMatchGroup('exactHash', 'abc123', 100);
    liveStore.insertMatchGroupMember(groupId, id1, 1000);
    liveStore.insertMatchGroupMember(groupId, id2, 800);
    liveStore.saveReportAction(groupId, { [String(id1)]: 'keep', [String(id2)]: 'delete' });

    const res = await request(liveApp).post('/api/commit');
    expect(res.status).toBe(200);
    expect(res.body.deleted).toEqual([]);
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.errors[0].path).toBe(fileToDelete);
    expect(res.body.errors[0].error).toMatch(/doesn’t have one/);
    // Nothing was trashed, so the file must still show up as pending.
    expect(liveStore.getPendingDeletes()).toContain(fileToDelete);
    expect(existsSync(fileToDelete)).toBe(true);
    liveStore.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });
});

describe('GET /api/media', () => {
  it('returns 400 when no path provided', async () => {
    const res = await request(app).get('/api/media');
    expect(res.status).toBe(400);
  });

  it('returns 400 when path is not absolute', async () => {
    const res = await request(app).get('/api/media?path=relative/path.jpg');
    expect(res.status).toBe(400);
  });

  it('returns 404 when file not in store', async () => {
    const res = await request(app).get('/api/media?path=/nonexistent/file.jpg');
    expect(res.status).toBe(404);
  });

  it('serves file when found in store', async () => {
    const tmpDir = '/tmp/find-dupes-media-test';
    mkdirSync(tmpDir, { recursive: true });
    const testFile = join(tmpDir, 'test.jpg');
    writeFileSync(testFile, 'fake image bytes');
    store.upsertFile({ path: testFile, size: 16, mtime: 1, mimeType: 'image/jpeg' });
    const res = await request(app).get(`/api/media?path=${encodeURIComponent(testFile)}`);
    expect(res.status).toBe(200);
    rmSync(tmpDir, { recursive: true, force: true });
  });
});
