export type FileInfo = {
  id: number;
  path: string;
  size: number;
  /** Milliseconds since epoch, from fs.lstat */
  mtime: number;
  mimeType: string;
  scannedAt: number;
  /** Soft-delete flag — set when a file disappears between scans, preserving cached fingerprints */
  deleted: boolean;
};

/** Optional enrichment from the metadata strategy. All fields are optional — not all files have all properties. */
export type FileMetadata = {
  width?: number;
  height?: number;
  bitrate?: number;
  duration?: number;
  exifDate?: string;
};

export type StrategyResult = {
  fingerprint: string;
  metadata?: FileMetadata;
};

/**
 * Plugin interface for fingerprinting strategies.
 *
 * `supportedMimeTypes` accepts exact types (`image/jpeg`) and wildcard patterns (`image/*`, `video/*`).
 * `analyze` returns a fingerprint string (format is strategy-specific) and optionally metadata
 * used for quality scoring and display — not for grouping.
 */
export type Strategy = {
  name: string;
  supportedMimeTypes: string[];
  analyze: (file: Pick<FileInfo, 'path' | 'mimeType'>) => Promise<StrategyResult>;
};

/**
 * A cluster of files identified as duplicates or near-duplicates by one strategy.
 * Uses a cluster model — all matching files are in one group, not pairwise pairs.
 */
export type MatchGroup = {
  id: number;
  strategy: string;
  representativeFingerprint: string;
  /** 0–100, where 100 = identical (exact hash match) */
  similarityScore: number;
  createdAt: number;
};

export type MatchGroupMember = {
  id: number;
  groupId: number;
  fileId: number;
  qualityScore: number;
};

export type MemberWithFile = MatchGroupMember & {
  file: FileInfo;
  metadata?: FileMetadata;
};

export type GroupWithMembers = MatchGroup & {
  members: MemberWithFile[];
};

/** `skip` means "I saw this group but chose not to act on it" — it won't reappear in the undecided queue. */
export type Decision = 'keep' | 'delete' | 'skip';

export type ReportAction = {
  id?: number;
  groupId: number;
  /** Keys are string-encoded file IDs (e.g. String(fileId)) */
  decisions: Record<string, Decision>;
  decidedAt: number;
};

export type ScanProgressEvent =
  | { type: 'file'; path: string; current: number; total?: number }
  | { type: 'groups'; count: number; fileCount: number };
