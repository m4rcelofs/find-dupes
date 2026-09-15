/**
 * Renders the live status line shown while a commit is moving files to the trash.
 *
 * `total` is the pending-delete count snapshotted when Commit was clicked; `pending` is the
 * count polled from the server as the commit works through the queue. A decision made
 * mid-commit can push `pending` above `total`, so both ends are clamped. A non-finite
 * `pending` falls back to "nothing done" rather than claiming completion.
 */
export const formatCommitProgress = ({ total, pending }: { total: number; pending: number }): string => {
  const safeTotal = Number.isFinite(total) ? Math.max(0, total) : 0;
  const safePending = Number.isFinite(pending) ? Math.max(0, pending) : safeTotal;
  const done = Math.min(safeTotal, Math.max(0, safeTotal - safePending));
  return `Moving files to trash… ${done} of ${safeTotal} done`;
};
