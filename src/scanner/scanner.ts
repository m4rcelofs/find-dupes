import type { Strategy, ScanProgressEvent } from '../types.js';
import type { CacheStore } from '../cache/cacheStore.js';
import { walkDirectory } from './fileWalker.js';
import { groupExact, groupPerceptual } from './grouping.js';
import { computeQualityScore } from './qualityScoring.js';

// Strategies that produce match groups (metadata is enrichment-only)
const GROUPING_STRATEGY_NAMES = new Set(['exactHash', 'perceptualImage', 'perceptualVideo', 'audioFingerprint']);

const strategyApplies = (strategy: Strategy, mimeType: string): boolean =>
  strategy.supportedMimeTypes.some((pattern) => {
    if (pattern.endsWith('/*')) return mimeType.startsWith(pattern.slice(0, -1));
    return pattern === mimeType;
  });

type ScanOptions = {
  rootDir: string;
  store: CacheStore;
  strategies: Strategy[];
  threshold: number;
  onProgress: (event: ScanProgressEvent) => void;
};

export const runScan = async ({ rootDir, store, strategies, threshold, onProgress }: ScanOptions): Promise<void> => {
  // Step 1: Walk directory and collect all live files
  const liveFiles: Array<{ path: string; size: number; mtime: number; mimeType: string }> = [];
  await walkDirectory(rootDir, (f) => liveFiles.push(f));

  // Step 2: Mark deleted files (files in DB that are no longer on disk)
  store.markDeletedExcept(new Set(liveFiles.map((f) => f.path)));

  // Step 3: Cache check and fingerprint each file
  let current = 0;
  for (const walkedFile of liveFiles) {
    current++;
    onProgress({ type: 'file', path: walkedFile.path, current, total: liveFiles.length });

    const existing = store.getFileByPath(walkedFile.path);
    let fileId: number;

    if (existing && existing.size === walkedFile.size && existing.mtime === walkedFile.mtime) {
      // File unchanged — only run strategies that don't have a cached result yet
      fileId = existing.id;
      const missingStrategies = strategies.filter(
        (s) => strategyApplies(s, walkedFile.mimeType) && !store.getStrategyResult(fileId, s.name),
      );
      for (const strategy of missingStrategies) {
        try {
          const result = await strategy.analyze(walkedFile);
          store.upsertStrategyResult(fileId, strategy.name, result.fingerprint, result.metadata ?? {});
        } catch {
          // Strategy failure (e.g. fpcalc not installed) — skip silently
        }
      }
    } else {
      // New or modified file — invalidate stale results, then upsert
      if (existing) store.invalidateFile(existing.id);
      fileId = store.upsertFile(walkedFile);

      for (const strategy of strategies) {
        if (!strategyApplies(strategy, walkedFile.mimeType)) continue;
        try {
          const result = await strategy.analyze(walkedFile);
          store.upsertStrategyResult(fileId, strategy.name, result.fingerprint, result.metadata ?? {});
        } catch {
          // Strategy failure — skip silently
        }
      }
    }
  }

  // Step 4 & 5: Group and quality-score per grouping strategy
  const groupingStrategies = strategies.filter((s) => GROUPING_STRATEGY_NAMES.has(s.name));

  for (const strategy of groupingStrategies) {
    store.clearMatchGroupsForStrategy(strategy.name);

    const results = store.getAllStrategyResults(strategy.name);
    const liveResults = results.filter((r) => {
      const file = store.getFileById(r.fileId);
      return file && !file.deleted;
    });

    const clusters =
      strategy.name === 'exactHash'
        ? groupExact(liveResults)
        : groupPerceptual(liveResults, threshold);

    for (const cluster of clusters) {
      const groupId = store.insertMatchGroup(
        strategy.name,
        cluster.representativeFingerprint,
        cluster.similarityScore,
      );
      for (const fileId of cluster.fileIds) {
        const file = store.getFileById(fileId);
        const sr = store.getStrategyResult(fileId, 'metadata');
        const qualityScore = computeQualityScore(
          sr?.metadata ?? {},
          file?.mimeType ?? '',
          file?.size ?? 0,
        );
        store.insertMatchGroupMember(groupId, fileId, qualityScore);
      }
    }
  }

  const groups = store.getGroupsWithMembers();
  onProgress({ type: 'groups', count: groups.length });
};
