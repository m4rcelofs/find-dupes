import { describe, it, expect, beforeEach } from 'vitest';
import { createCacheStore } from './cacheStore.js';
import type { FileMetadata } from '../types.js';

let store: ReturnType<typeof createCacheStore>;

beforeEach(() => {
  store = createCacheStore(':memory:');
});

describe('files', () => {
  it('upserts and retrieves a file by path', () => {
    const id = store.upsertFile({ path: '/a/b.jpg', size: 1000, mtime: 1000, mimeType: 'image/jpeg' });
    const file = store.getFileByPath('/a/b.jpg');
    expect(file).toBeDefined();
    expect(file!.id).toBe(id);
    expect(file!.path).toBe('/a/b.jpg');
    expect(file!.deleted).toBe(false);
  });

  it('updates mtime/size on re-upsert', () => {
    store.upsertFile({ path: '/a/b.jpg', size: 1000, mtime: 1000, mimeType: 'image/jpeg' });
    store.upsertFile({ path: '/a/b.jpg', size: 2000, mtime: 2000, mimeType: 'image/jpeg' });
    const file = store.getFileByPath('/a/b.jpg');
    expect(file!.size).toBe(2000);
    expect(file!.mtime).toBe(2000);
  });

  it('marks files as deleted when not in live paths', () => {
    store.upsertFile({ path: '/a/b.jpg', size: 1, mtime: 1, mimeType: 'image/jpeg' });
    store.upsertFile({ path: '/a/c.jpg', size: 1, mtime: 1, mimeType: 'image/jpeg' });
    store.markDeletedExcept(new Set(['/a/b.jpg']));
    expect(store.getFileByPath('/a/c.jpg')!.deleted).toBe(true);
    expect(store.getFileByPath('/a/b.jpg')!.deleted).toBe(false);
  });

  it('invalidates strategy results for a file', () => {
    const id = store.upsertFile({ path: '/a/b.jpg', size: 1, mtime: 1, mimeType: 'image/jpeg' });
    store.upsertStrategyResult(id, 'exactHash', 'abc123', {});
    store.invalidateFile(id);
    expect(store.getStrategyResult(id, 'exactHash')).toBeUndefined();
  });

  it('retrieves a file by id', () => {
    const id = store.upsertFile({ path: '/a.jpg', size: 1, mtime: 1, mimeType: 'image/jpeg' });
    const file = store.getFileById(id);
    expect(file?.path).toBe('/a.jpg');
  });
});

describe('strategy results', () => {
  it('stores and retrieves a strategy result', () => {
    const id = store.upsertFile({ path: '/a/b.jpg', size: 1, mtime: 1, mimeType: 'image/jpeg' });
    const meta: FileMetadata = { width: 1920, height: 1080 };
    store.upsertStrategyResult(id, 'exactHash', 'deadbeef', meta);
    const result = store.getStrategyResult(id, 'exactHash');
    expect(result).toBeDefined();
    expect(result!.fingerprint).toBe('deadbeef');
    expect(result!.metadata.width).toBe(1920);
  });

  it('lists all results for a strategy', () => {
    const id1 = store.upsertFile({ path: '/a.jpg', size: 1, mtime: 1, mimeType: 'image/jpeg' });
    const id2 = store.upsertFile({ path: '/b.jpg', size: 1, mtime: 1, mimeType: 'image/jpeg' });
    store.upsertStrategyResult(id1, 'exactHash', 'aaa', {});
    store.upsertStrategyResult(id2, 'exactHash', 'bbb', {});
    const results = store.getAllStrategyResults('exactHash');
    expect(results).toHaveLength(2);
  });
});

describe('match groups', () => {
  it('inserts groups and members, clears by strategy', () => {
    const fileId = store.upsertFile({ path: '/a.jpg', size: 1, mtime: 1, mimeType: 'image/jpeg' });
    const groupId = store.insertMatchGroup('exactHash', 'abc', 100);
    store.insertMatchGroupMember(groupId, fileId, 500);
    const groups = store.getGroupsWithMembers();
    expect(groups).toHaveLength(1);
    expect(groups[0].members).toHaveLength(1);

    store.clearMatchGroupsForStrategy('exactHash');
    expect(store.getGroupsWithMembers()).toHaveLength(0);
  });

  it('returns undecided groups only when undecidedOnly=true', () => {
    const fileId = store.upsertFile({ path: '/a.jpg', size: 1, mtime: 1, mimeType: 'image/jpeg' });
    const groupId = store.insertMatchGroup('exactHash', 'abc', 100);
    store.insertMatchGroupMember(groupId, fileId, 500);
    store.saveReportAction(groupId, { [String(fileId)]: 'keep' });
    expect(store.getGroupsWithMembers(true)).toHaveLength(0);
    expect(store.getGroupsWithMembers(false)).toHaveLength(1);
  });

  it('returns member id as match_group_members.id, not file id', () => {
    // Insert a spare file first so fileId > 1, ensuring mgm.id (which starts at 1) differs from fileId
    store.upsertFile({ path: '/spare.jpg', size: 1, mtime: 1, mimeType: 'image/jpeg' });
    const fileId = store.upsertFile({ path: '/x.jpg', size: 1, mtime: 1, mimeType: 'image/jpeg' });
    const groupId = store.insertMatchGroup('exactHash', 'abc', 100);
    store.insertMatchGroupMember(groupId, fileId, 500);
    const groups = store.getGroupsWithMembers();
    const member = groups[0].members[0];
    expect(member.id).not.toBe(fileId); // mgm.id (=1) != file.id (=2)
    expect(member.fileId).toBe(fileId);
  });
});

describe('relative path storage (rootDir)', () => {
  const root = '/mnt/photos';

  it('stores a relative path and returns the absolute path from getFileByPath', () => {
    const s = createCacheStore(':memory:', root);
    const abs = `${root}/a/b.jpg`;
    s.upsertFile({ path: abs, size: 1, mtime: 1, mimeType: 'image/jpeg' });
    const file = s.getFileByPath(abs);
    expect(file).toBeDefined();
    expect(file!.path).toBe(abs);
  });

  it('getAllFiles returns absolute paths', () => {
    const s = createCacheStore(':memory:', root);
    s.upsertFile({ path: `${root}/img.jpg`, size: 1, mtime: 1, mimeType: 'image/jpeg' });
    const files = s.getAllFiles();
    expect(files[0].path).toBe(`${root}/img.jpg`);
  });

  it('markDeletedExcept accepts absolute paths and resolves correctly', () => {
    const s = createCacheStore(':memory:', root);
    s.upsertFile({ path: `${root}/a.jpg`, size: 1, mtime: 1, mimeType: 'image/jpeg' });
    s.upsertFile({ path: `${root}/b.jpg`, size: 1, mtime: 1, mimeType: 'image/jpeg' });
    s.markDeletedExcept(new Set([`${root}/a.jpg`]));
    expect(s.getFileByPath(`${root}/a.jpg`)!.deleted).toBe(false);
    expect(s.getFileByPath(`${root}/b.jpg`)!.deleted).toBe(true);
  });

  it('getPendingDeletes returns absolute paths', () => {
    const s = createCacheStore(':memory:', root);
    const abs = `${root}/img.jpg`;
    const id = s.upsertFile({ path: abs, size: 1, mtime: 1, mimeType: 'image/jpeg' });
    const gid = s.insertMatchGroup('exactHash', 'abc', 100);
    s.insertMatchGroupMember(gid, id, 500);
    s.saveReportAction(gid, { [String(id)]: 'delete' });
    expect(s.getPendingDeletes()).toContain(abs);
  });

  it('markFileDeletedByPath accepts an absolute path', () => {
    const s = createCacheStore(':memory:', root);
    const abs = `${root}/img.jpg`;
    s.upsertFile({ path: abs, size: 1, mtime: 1, mimeType: 'image/jpeg' });
    s.markFileDeletedByPath(abs);
    expect(s.getFileByPath(abs)!.deleted).toBe(true);
  });

  it('getFileById returns absolute path', () => {
    const s = createCacheStore(':memory:', root);
    const abs = `${root}/img.jpg`;
    const id = s.upsertFile({ path: abs, size: 1, mtime: 1, mimeType: 'image/jpeg' });
    expect(s.getFileById(id)!.path).toBe(abs);
  });

  it('getGroupsWithMembers returns absolute paths in member files', () => {
    const s = createCacheStore(':memory:', root);
    const abs = `${root}/img.jpg`;
    const id = s.upsertFile({ path: abs, size: 1, mtime: 1, mimeType: 'image/jpeg' });
    const gid = s.insertMatchGroup('exactHash', 'abc', 100);
    s.insertMatchGroupMember(gid, id, 500);
    const groups = s.getGroupsWithMembers();
    expect(groups[0].members[0].file.path).toBe(abs);
  });

  it('re-upsert and lookup both work under the same rootDir', () => {
    const s = createCacheStore(':memory:', root);
    const abs = `${root}/sub/img.jpg`;
    s.upsertFile({ path: abs, size: 100, mtime: 1, mimeType: 'image/jpeg' });
    s.upsertFile({ path: abs, size: 200, mtime: 2, mimeType: 'image/jpeg' });
    const file = s.getFileByPath(abs);
    expect(file!.size).toBe(200);
    expect(file!.path).toBe(abs);
  });
});

describe('report actions', () => {
  it('saves decisions and returns pending deletes', () => {
    const id = store.upsertFile({ path: '/a.jpg', size: 1, mtime: 1, mimeType: 'image/jpeg' });
    const groupId = store.insertMatchGroup('exactHash', 'abc', 100);
    store.insertMatchGroupMember(groupId, id, 500);
    store.saveReportAction(groupId, { [String(id)]: 'delete' });
    const deletes = store.getPendingDeletes();
    expect(deletes).toContain('/a.jpg');
  });

  it('does not return paths marked as keep', () => {
    const id = store.upsertFile({ path: '/a.jpg', size: 1, mtime: 1, mimeType: 'image/jpeg' });
    const groupId = store.insertMatchGroup('exactHash', 'abc', 100);
    store.insertMatchGroupMember(groupId, id, 500);
    store.saveReportAction(groupId, { [String(id)]: 'keep' });
    expect(store.getPendingDeletes()).not.toContain('/a.jpg');
  });

  it('updates decision when saveReportAction is called twice on the same group', () => {
    const id = store.upsertFile({ path: '/a.jpg', size: 1, mtime: 1, mimeType: 'image/jpeg' });
    const groupId = store.insertMatchGroup('exactHash', 'abc', 100);
    store.insertMatchGroupMember(groupId, id, 500);
    store.saveReportAction(groupId, { [String(id)]: 'keep' });
    store.saveReportAction(groupId, { [String(id)]: 'delete' }); // second call updates
    const deletes = store.getPendingDeletes();
    expect(deletes).toContain('/a.jpg');
  });

  it('does not return paths where file is marked deleted', () => {
    const id = store.upsertFile({ path: '/a.jpg', size: 1, mtime: 1, mimeType: 'image/jpeg' });
    const groupId = store.insertMatchGroup('exactHash', 'abc', 100);
    store.insertMatchGroupMember(groupId, id, 500);
    store.saveReportAction(groupId, { [String(id)]: 'delete' });
    store.markDeletedExcept(new Set()); // mark all files deleted
    expect(store.getPendingDeletes()).not.toContain('/a.jpg');
  });
});
