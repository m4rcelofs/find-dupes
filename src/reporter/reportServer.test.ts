import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createCacheStore } from '../cache/cacheStore.js';
import { createReportServer } from './reportServer.js';

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
});
