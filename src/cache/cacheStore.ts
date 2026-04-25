import Database from 'better-sqlite3';
import { relative, join } from 'node:path';
import type { FileInfo, FileMetadata, GroupWithMembers, Decision } from '../types.js';

const MIGRATIONS = `
  CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT UNIQUE NOT NULL,
    size INTEGER NOT NULL,
    mtime INTEGER NOT NULL,
    mime_type TEXT NOT NULL,
    scanned_at INTEGER NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0  -- soft delete: 1 = no longer on disk
  );

  CREATE TABLE IF NOT EXISTS strategy_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    strategy TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    computed_at INTEGER NOT NULL,
    UNIQUE(file_id, strategy)  -- safe upserts; re-running a strategy overwrites the old result
  );

  CREATE TABLE IF NOT EXISTS match_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    strategy TEXT NOT NULL,
    representative_fingerprint TEXT NOT NULL,
    similarity_score REAL NOT NULL,
    created_at INTEGER NOT NULL
    -- rebuilt from scratch on every scan; not persisted incrementally
  );

  CREATE TABLE IF NOT EXISTS match_group_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL REFERENCES match_groups(id) ON DELETE CASCADE,
    file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    quality_score REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS report_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL UNIQUE REFERENCES match_groups(id) ON DELETE CASCADE,
    decisions_json TEXT NOT NULL,  -- Record<string, Decision>, keys are string file IDs
    decided_at INTEGER NOT NULL
    -- UNIQUE(group_id): re-deciding a group uses ON CONFLICT DO UPDATE
  );
`;

/** Structural type of the cache store — derived automatically from the factory return. */
export type CacheStore = ReturnType<typeof createCacheStore>;

export const createCacheStore = (dbPath: string, rootDir?: string) => {
  const db = new Database(dbPath);

  /**
   * Convert an absolute path to a root-relative path for storage.
   * Stored with forward slashes so the DB is portable across platforms.
   */
  const toRel = (abs: string): string =>
    rootDir ? relative(rootDir, abs).replace(/\\/g, '/') : abs;

  /** Reconstruct an absolute path from a stored relative path. */
  const toAbs = (rel: string): string =>
    rootDir ? join(rootDir, rel) : rel;
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(MIGRATIONS);

  const now = () => Date.now();

  /**
   * Atomically insert or update a file record and return its row ID.
   * Uses a single `INSERT ... ON CONFLICT DO UPDATE ... RETURNING id` — no separate SELECT.
   */
  const upsertFile = (file: { path: string; size: number; mtime: number; mimeType: string }): number => {
    const row = db.prepare(`
      INSERT INTO files (path, size, mtime, mime_type, scanned_at, deleted)
      VALUES (@path, @size, @mtime, @mimeType, @scannedAt, 0)
      ON CONFLICT(path) DO UPDATE SET
        size = excluded.size,
        mtime = excluded.mtime,
        scanned_at = excluded.scanned_at,
        deleted = 0
      RETURNING id
    `).get({ ...file, path: toRel(file.path), scannedAt: now() }) as { id: number };
    return row.id;
  };

  const rowToFileInfo = (row: Record<string, unknown>): FileInfo => ({
    id: row.id as number,
    path: toAbs(row.path as string),
    size: row.size as number,
    mtime: row.mtime as number,
    mimeType: row.mime_type as string,
    scannedAt: row.scanned_at as number,
    deleted: (row.deleted as number) === 1,
  });

  const getFileByPath = (path: string): FileInfo | undefined => {
    const row = db.prepare('SELECT * FROM files WHERE path = ?').get(toRel(path)) as Record<string, unknown> | undefined;
    return row ? rowToFileInfo(row) : undefined;
  };

  const getFileById = (id: number): FileInfo | undefined => {
    const row = db.prepare('SELECT * FROM files WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? rowToFileInfo(row) : undefined;
  };

  const getAllFiles = (): FileInfo[] =>
    (db.prepare('SELECT * FROM files').all() as Record<string, unknown>[]).map(rowToFileInfo);

  /** Deletes all strategy_results for a file. Called when size/mtime changed — cached fingerprints are stale. */
  const invalidateFile = (fileId: number): void => {
    db.prepare('DELETE FROM strategy_results WHERE file_id = ?').run(fileId);
  };

  /**
   * Marks files as deleted if their path is not in `livePaths`.
   * Called at scan start with the set of paths currently on disk.
   * Runs in a transaction to keep the batch update atomic.
   */
  const markDeletedExcept = (livePaths: Set<string>): void => {
    const liveRelPaths = new Set([...livePaths].map(toRel));
    const allFiles = db.prepare('SELECT id, path FROM files WHERE deleted = 0').all() as { id: number; path: string }[];
    const stmt = db.prepare('UPDATE files SET deleted = 1 WHERE id = ?');
    const markDeleted = db.transaction(() => {
      for (const file of allFiles) {
        if (!liveRelPaths.has(file.path)) stmt.run(file.id);
      }
    });
    markDeleted();
  };

  const upsertStrategyResult = (
    fileId: number,
    strategy: string,
    fingerprint: string,
    metadata: FileMetadata,
  ): void => {
    db.prepare(`
      INSERT INTO strategy_results (file_id, strategy, fingerprint, metadata_json, computed_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(file_id, strategy) DO UPDATE SET
        fingerprint = excluded.fingerprint,
        metadata_json = excluded.metadata_json,
        computed_at = excluded.computed_at
    `).run(fileId, strategy, fingerprint, JSON.stringify(metadata), now());
  };

  const getStrategyResult = (
    fileId: number,
    strategy: string,
  ): { fingerprint: string; metadata: FileMetadata } | undefined => {
    const row = db.prepare(
      'SELECT fingerprint, metadata_json FROM strategy_results WHERE file_id = ? AND strategy = ?',
    ).get(fileId, strategy) as { fingerprint: string; metadata_json: string } | undefined;
    if (!row) return undefined;
    return { fingerprint: row.fingerprint, metadata: JSON.parse(row.metadata_json) as FileMetadata };
  };

  const getAllStrategyResults = (strategy: string): Array<{
    fileId: number;
    fingerprint: string;
    metadata: FileMetadata;
    computedAt: number;
  }> => {
    const rows = db.prepare(
      'SELECT file_id, fingerprint, metadata_json, computed_at FROM strategy_results WHERE strategy = ?',
    ).all(strategy) as Array<{ file_id: number; fingerprint: string; metadata_json: string; computed_at: number }>;
    return rows.map((r) => ({
      fileId: r.file_id,
      fingerprint: r.fingerprint,
      metadata: JSON.parse(r.metadata_json) as FileMetadata,
      computedAt: r.computed_at,
    }));
  };

  const clearMatchGroupsForStrategy = (strategy: string): void => {
    db.prepare('DELETE FROM match_groups WHERE strategy = ?').run(strategy);
  };

  const insertMatchGroup = (strategy: string, fingerprint: string, similarityScore: number): number => {
    const result = db.prepare(`
      INSERT INTO match_groups (strategy, representative_fingerprint, similarity_score, created_at)
      VALUES (?, ?, ?, ?)
    `).run(strategy, fingerprint, similarityScore, now());
    return result.lastInsertRowid as number;
  };

  const insertMatchGroupMember = (groupId: number, fileId: number, qualityScore: number): void => {
    db.prepare(
      'INSERT INTO match_group_members (group_id, file_id, quality_score) VALUES (?, ?, ?)',
    ).run(groupId, fileId, qualityScore);
  };

  /**
   * Returns groups with all their members, file info, and metadata joined in.
   * Members are ordered by quality_score DESC (best copy first).
   *
   * @param undecidedOnly When true (default for the UI review queue), excludes groups
   *   that already have a report_actions record.
   */
  const getGroupsWithMembers = (undecidedOnly = false): GroupWithMembers[] => {
    // Build effective prior decision per file across all decided groups. 'keep' beats 'delete'.
    const allActions = db.prepare('SELECT decisions_json FROM report_actions').all() as Array<{ decisions_json: string }>;
    const priorByFileId = new Map<number, 'keep' | 'delete'>();
    for (const { decisions_json } of allActions) {
      for (const [fileIdStr, dec] of Object.entries(JSON.parse(decisions_json) as Record<string, Decision>)) {
        if (dec !== 'keep' && dec !== 'delete') continue;
        const fid = Number(fileIdStr);
        if (dec === 'keep' || !priorByFileId.has(fid)) priorByFileId.set(fid, dec);
      }
    }

    let groupQuery = `
      SELECT mg.*,
        (SELECT SUM(f.size) FROM match_group_members mgm JOIN files f ON f.id = mgm.file_id WHERE mgm.group_id = mg.id) AS total_size
      FROM match_groups mg`;
    if (undecidedOnly) {
      groupQuery += ' WHERE mg.id NOT IN (SELECT group_id FROM report_actions)';
    }
    groupQuery += ' ORDER BY mg.similarity_score DESC, total_size DESC';
    const groups = db.prepare(groupQuery).all() as Array<{
      id: number; strategy: string; representative_fingerprint: string;
      similarity_score: number; created_at: number;
    }>;

    return groups.map((g) => {
      const members = db.prepare(`
        SELECT mgm.id as mgm_id, mgm.group_id, mgm.file_id, mgm.quality_score,
               f.path, f.size, f.mtime, f.mime_type, f.scanned_at, f.deleted,
               sr.metadata_json, sr.fingerprint
        FROM match_group_members mgm
        JOIN files f ON f.id = mgm.file_id
        LEFT JOIN strategy_results sr ON sr.file_id = mgm.file_id AND sr.strategy = ?
        WHERE mgm.group_id = ?
        ORDER BY mgm.quality_score DESC
      `).all(g.strategy, g.id) as Array<Record<string, unknown> & { mgm_id: number }>;

      return {
        id: g.id,
        strategy: g.strategy,
        representativeFingerprint: g.representative_fingerprint,
        similarityScore: g.similarity_score,
        createdAt: g.created_at,
        members: members.map((m) => ({
          id: m.mgm_id as number,
          groupId: g.id,
          fileId: m.file_id as number,
          qualityScore: m.quality_score as number,
          file: {
            id: m.file_id as number,
            path: toAbs(m.path as string),
            size: m.size as number,
            mtime: m.mtime as number,
            mimeType: m.mime_type as string,
            scannedAt: m.scanned_at as number,
            deleted: (m.deleted as number) === 1,
          },
          metadata: m.metadata_json ? JSON.parse(m.metadata_json as string) as FileMetadata : undefined,
          fingerprint: m.fingerprint as string | undefined,
          priorDecision: priorByFileId.get(m.file_id as number),
        })),
      };
    });
  };

  /** Saves (or overwrites) a user's decision for a group. */
  const saveReportAction = (groupId: number, decisions: Record<string, Decision>): void => {
    db.prepare(`
      INSERT INTO report_actions (group_id, decisions_json, decided_at)
      VALUES (?, ?, ?)
      ON CONFLICT(group_id) DO UPDATE SET
        decisions_json = excluded.decisions_json,
        decided_at = excluded.decided_at
    `).run(groupId, JSON.stringify(decisions), now());
  };

  /**
   * Returns paths of all non-deleted files marked 'delete' in any decided group.
   * The UI hides already-deleted files and tags already-kept ones, so an explicit
   * delete after seeing the "Previously kept" badge is an informed override.
   */
  const getPendingDeletes = (): string[] => {
    const rows = db.prepare(`
      SELECT DISTINCT f.path, f.id as file_id, ra.decisions_json
      FROM report_actions ra
      JOIN match_group_members mgm ON mgm.group_id = ra.group_id
      JOIN files f ON f.id = mgm.file_id
      WHERE f.deleted = 0
    `).all() as Array<{ path: string; file_id: number; decisions_json: string }>;

    return rows
      .filter((row) => {
        const decisions = JSON.parse(row.decisions_json) as Record<string, Decision>;
        return decisions[String(row.file_id)] === 'delete';
      })
      .map((row) => toAbs(row.path));
  };

  /** Marks a file as deleted by path. Called after successfully moving it to the system trash. */
  const markFileDeletedByPath = (path: string): void => {
    db.prepare('UPDATE files SET deleted = 1 WHERE path = ?').run(toRel(path));
  };

  /** Deletes all saved review decisions, returning every group to the undecided queue. */
  const clearReportActions = (): void => {
    db.prepare('DELETE FROM report_actions').run();
  };

  const close = () => db.close();

  return {
    upsertFile, getFileByPath, getFileById, getAllFiles, invalidateFile, markDeletedExcept,
    upsertStrategyResult, getStrategyResult, getAllStrategyResults,
    clearMatchGroupsForStrategy, insertMatchGroup, insertMatchGroupMember,
    getGroupsWithMembers, saveReportAction, getPendingDeletes, markFileDeletedByPath, clearReportActions, close,
  };
};
