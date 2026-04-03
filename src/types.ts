export type FileInfo = {
  id: number;
  path: string;
  size: number;
  mtime: number;
  mimeType: string;
  scannedAt: number;
  deleted: boolean;
};

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

export type Strategy = {
  name: string;
  supportedMimeTypes: string[];
  analyze: (file: Pick<FileInfo, 'path' | 'mimeType'>) => Promise<StrategyResult>;
};

export type MatchGroup = {
  id: number;
  strategy: string;
  representativeFingerprint: string;
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

export type Decision = 'keep' | 'delete' | 'skip';

export type ReportAction = {
  id?: number;
  groupId: number;
  decisions: Record<string, Decision>;
  decidedAt: number;
};

export type ScanProgressEvent =
  | { type: 'file'; path: string; current: number; total: number }
  | { type: 'groups'; count: number };
