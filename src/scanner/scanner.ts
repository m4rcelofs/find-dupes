import type { Strategy, ScanProgressEvent } from '../types.js';
import type { CacheStore } from '../cache/cacheStore.js';
import { walkDirectory } from './fileWalker.js';
import { groupExact, groupPerceptual } from './grouping.js';
import { computeQualityScore } from './qualityScoring.js';

/**
 * Strategy names that produce match groups. `metadata` is excluded — it is enrichment-only,
 * used for quality scoring and UI display, not for identifying duplicates.
 * Adding a new grouping strategy requires adding its name here.
 */
const GROUPING_STRATEGY_NAMES = new Set(['exactHash', 'perceptualImage', 'perceptualVideo', 'audioFingerprint']);

/**
 * Returns true if a strategy applies to the given MIME type.
 * Handles both exact types (`image/jpeg`) and wildcard patterns (`image/*`).
 */
const strategyApplies = (strategy: Strategy, mimeType: string): boolean =>
  strategy.supportedMimeTypes.some((pattern) => {
    if (pattern.endsWith('/*')) return mimeType.startsWith(pattern.slice(0, -1));
    return pattern === mimeType;
  });

type ScanOptions = {
  rootDir: string;
  store: CacheStore;
  strategies: Strategy[];
  /** Per-strategy Hamming distance thresholds. Keyed by strategy name; falls back to 10 if absent. */
  thresholds: Record<string, number>;
  /** When true, ignore cached fingerprints and re-run all strategies on every file. */
  force?: boolean;
  onProgress: (event: ScanProgressEvent) => void;
};

/**
 * Full scan pipeline:
 *
 * 1. Walk `rootDir` and collect all live image/video files.
 * 2. Soft-delete DB records for files no longer on disk.
 * 3. Fingerprint each file — cache hits only run strategies with no existing result
 *    (handles newly added strategies); cache misses invalidate stale results and run all strategies.
 *    Strategy failures are swallowed silently (e.g. fpcalc not installed, corrupt file).
 * 4. For each grouping strategy: clear previous groups, cluster current fingerprints,
 *    insert groups and members with quality scores.
 */
export const runScan = async ({ rootDir, store, strategies, thresholds, force = false, onProgress }: ScanOptions): Promise<void> => {
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

    if (!force && existing && existing.size === walkedFile.size && existing.mtime === walkedFile.mtime) {
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
  onProgress({ type: 'grouping' });

  // Pre-load all files and metadata once to avoid per-file DB queries in the insertion loop.
  const allFilesMap = new Map(store.getAllFiles().map((f) => [f.id, f]));
  const allMetadataMap = new Map(store.getAllStrategyResults('metadata').map((r) => [r.fileId, r]));
  const liveFileIds = new Set([...allFilesMap.values()].filter((f) => !f.deleted).map((f) => f.id));

  const groupingStrategies = strategies.filter((s) => GROUPING_STRATEGY_NAMES.has(s.name));

  for (const strategy of groupingStrategies) {
    store.clearMatchGroupsForStrategy(strategy.name);

    const results = store.getAllStrategyResults(strategy.name);
    const liveResults = results.filter((r) => liveFileIds.has(r.fileId));

    const clusters =
      strategy.name === 'exactHash'
        ? groupExact(liveResults)
        : groupPerceptual(liveResults, thresholds[strategy.name] ?? 10);

    for (const cluster of clusters) {
      const groupId = store.insertMatchGroup(
        strategy.name,
        cluster.representativeFingerprint,
        cluster.similarityScore,
      );
      for (const fileId of cluster.fileIds) {
        const file = allFilesMap.get(fileId);
        const sr = allMetadataMap.get(fileId);
        const qualityScore = computeQualityScore(
          sr?.metadata ?? {},
          file?.mimeType ?? '',
          file?.size ?? 0,
          file?.path ?? '',
        );
        store.insertMatchGroupMember(groupId, fileId, qualityScore);
      }
    }
  }

  const groups = store.getGroupsWithMembers();
  const fileCount = groups.reduce((sum, g) => sum + g.members.length, 0);
  onProgress({ type: 'groups', count: groups.length, fileCount, totalFiles: liveFiles.length });
};
