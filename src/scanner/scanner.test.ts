import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, copyFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCacheStore } from '../cache/cacheStore.js';
import { createExactHashStrategy } from '../strategies/exactHash.js';
import { runScan } from './scanner.js';

const FIXTURES = join(import.meta.dirname, '../strategies/fixtures');

let root: string;
let dbPath: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'find-dupes-scan-'));
  dbPath = join(root, 'test.db');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

it('detects exact duplicate images', async () => {
  copyFileSync(join(FIXTURES, 'red-10x10.jpg'), join(root, 'a.jpg'));
  copyFileSync(join(FIXTURES, 'red-10x10.jpg'), join(root, 'b.jpg'));

  const store = createCacheStore(dbPath);
  await runScan({
    rootDir: root,
    store,
    strategies: [createExactHashStrategy()],
    thresholds: {},
    onProgress: () => {},
  });

  const groups = store.getGroupsWithMembers();
  expect(groups).toHaveLength(1);
  expect(groups[0].strategy).toBe('exactHash');
  expect(groups[0].members).toHaveLength(2);
  store.close();
});

it('skips unchanged files on re-scan (caches correctly)', async () => {
  copyFileSync(join(FIXTURES, 'red-10x10.jpg'), join(root, 'a.jpg'));

  const store = createCacheStore(dbPath);
  const baseStrategy = createExactHashStrategy();
  let callCount = 0;
  const trackingStrategy = {
    ...baseStrategy,
    analyze: async (f: Parameters<typeof baseStrategy.analyze>[0]) => {
      callCount++;
      return baseStrategy.analyze(f);
    },
  };

  await runScan({ rootDir: root, store, strategies: [trackingStrategy], thresholds: {}, onProgress: () => {} });
  const firstCount = callCount;

  // Re-scan without modifying the file
  await runScan({ rootDir: root, store, strategies: [trackingStrategy], thresholds: {}, onProgress: () => {} });

  // Strategy should not have been called again for the unchanged file
  expect(callCount).toBe(firstCount);
  store.close();
});

it('marks deleted files that no longer exist on re-scan', async () => {
  copyFileSync(join(FIXTURES, 'red-10x10.jpg'), join(root, 'a.jpg'));
  copyFileSync(join(FIXTURES, 'blue-10x10.png'), join(root, 'b.png'));

  const store = createCacheStore(dbPath);
  await runScan({ rootDir: root, store, strategies: [createExactHashStrategy()], thresholds: {}, onProgress: () => {} });

  // Remove b.png and rescan
  rmSync(join(root, 'b.png'));
  await runScan({ rootDir: root, store, strategies: [createExactHashStrategy()], thresholds: {}, onProgress: () => {} });

  const deletedFile = store.getFileByPath(join(root, 'b.png'));
  expect(deletedFile?.deleted).toBe(true);
  store.close();
});

it('runs missing strategy on unchanged file without re-running existing ones', async () => {
  copyFileSync(join(FIXTURES, 'red-10x10.jpg'), join(root, 'a.jpg'));

  const store = createCacheStore(dbPath);
  const strategy1 = createExactHashStrategy();
  let s1Calls = 0;
  const tracking1 = {
    ...strategy1,
    analyze: async (f: Parameters<typeof strategy1.analyze>[0]) => { s1Calls++; return strategy1.analyze(f); },
  };

  // First scan: only strategy1
  await runScan({ rootDir: root, store, strategies: [tracking1], thresholds: {}, onProgress: () => {} });
  expect(s1Calls).toBe(1);

  // Second scan: add a second strategy — strategy1 should NOT re-run (result already cached)
  const strategy2 = { ...strategy1, name: 'strategy2' };
  let s2Calls = 0;
  const tracking2 = {
    ...strategy2,
    analyze: async (f: Parameters<typeof strategy2.analyze>[0]) => { s2Calls++; return strategy2.analyze(f); },
  };

  await runScan({ rootDir: root, store, strategies: [tracking1, tracking2], thresholds: {}, onProgress: () => {} });
  expect(s1Calls).toBe(1); // not called again
  expect(s2Calls).toBe(1); // called once for the new strategy
  store.close();
});

it('emits progress events', async () => {
  copyFileSync(join(FIXTURES, 'red-10x10.jpg'), join(root, 'a.jpg'));

  const store = createCacheStore(dbPath);
  const events: string[] = [];
  await runScan({
    rootDir: root,
    store,
    strategies: [createExactHashStrategy()],
    thresholds: {},
    onProgress: (e) => events.push(e.type),
  });

  expect(events).toContain('file');
  expect(events).toContain('groups');
  store.close();
});
