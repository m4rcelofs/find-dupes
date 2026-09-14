import type { GroupWithMembers, Decision } from '../../../../types.js';

export const fetchGroups = async (): Promise<GroupWithMembers[]> => {
  const res = await fetch('/api/groups');
  if (!res.ok) throw new Error('Failed to fetch groups');
  return res.json() as Promise<GroupWithMembers[]>;
};

export const saveAction = async (
  groupId: number,
  decisions: Record<string, Decision>,
): Promise<void> => {
  const res = await fetch(`/api/groups/${groupId}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decisions }),
  });
  if (!res.ok) throw new Error('Failed to save action');
};

export const fetchPendingCount = async (): Promise<number> => {
  const res = await fetch('/api/pending-count');
  if (!res.ok) throw new Error('Failed to fetch pending count');
  const data = await res.json() as { count: number };
  return data.count;
};

export type CommitResult = {
  dryRun: boolean;
  deleted?: string[];
  wouldDelete?: string[];
  /** Files moved to the on-volume trash dir because their volume has no system trash. */
  fallback?: Array<{ path: string; destination: string }>;
  fallbackDir?: string;
  errors?: Array<{ path: string; error: string }>;
};

export const commitDeletes = async (): Promise<CommitResult> => {
  const res = await fetch('/api/commit', { method: 'POST' });
  if (!res.ok) throw new Error('Failed to commit');
  return res.json();
};

export const mediaUrl = (filePath: string): string =>
  `/api/media?path=${encodeURIComponent(filePath)}`;
