import { describe, it, expect } from 'vitest';
import { formatCommitProgress } from './progress.js';

describe('formatCommitProgress', () => {
  it('reports nothing done when no file has been trashed yet', () => {
    expect(formatCommitProgress({ total: 10, pending: 10 })).toBe('Moving files to trash… 0 of 10 done');
  });

  it('counts files that have left the pending queue', () => {
    expect(formatCommitProgress({ total: 10, pending: 4 })).toBe('Moving files to trash… 6 of 10 done');
  });

  it('reports everything done when the queue empties', () => {
    expect(formatCommitProgress({ total: 10, pending: 0 })).toBe('Moving files to trash… 10 of 10 done');
  });

  it('never goes negative when a decision is made mid-commit', () => {
    // A new 'delete' decision can push the live pending count above the snapshot.
    expect(formatCommitProgress({ total: 10, pending: 12 })).toBe('Moving files to trash… 0 of 10 done');
  });

  it('handles an empty commit', () => {
    expect(formatCommitProgress({ total: 0, pending: 0 })).toBe('Moving files to trash… 0 of 0 done');
  });

  it('clamps a negative pending count', () => {
    expect(formatCommitProgress({ total: 10, pending: -3 })).toBe('Moving files to trash… 10 of 10 done');
  });

  it('clamps a negative total', () => {
    expect(formatCommitProgress({ total: -5, pending: 0 })).toBe('Moving files to trash… 0 of 0 done');
  });

  it('never claims completion when the pending count is unusable', () => {
    expect(formatCommitProgress({ total: 10, pending: NaN })).toBe('Moving files to trash… 0 of 10 done');
  });
});
