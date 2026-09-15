import { describe, it, expect } from 'vitest';
import { playWindow } from './playback.js';

describe('playWindow', () => {
  it('plays every video when a group has fewer than the cap', () => {
    expect(playWindow([1, 2], [])).toEqual([1, 2]);
  });

  it('caps concurrent playback at three, in display order', () => {
    expect(playWindow([1, 2, 3, 4, 5], [])).toEqual([1, 2, 3]);
  });

  it('pulls in the next copy when one in the window is marked for deletion', () => {
    expect(playWindow([1, 2, 3, 4, 5], [2])).toEqual([1, 3, 4]);
  });

  it('keeps pulling copies in as more are marked for deletion', () => {
    expect(playWindow([1, 2, 3, 4, 5], [2, 1])).toEqual([3, 4, 5]);
  });

  it('plays nothing when every copy is marked for deletion', () => {
    expect(playWindow([1, 2], [1, 2])).toEqual([]);
  });

  it('ignores deletions for files outside the group', () => {
    expect(playWindow([1, 2, 3, 4], [99])).toEqual([1, 2, 3]);
  });

  it('plays nothing for an empty group', () => {
    expect(playWindow([], [])).toEqual([]);
  });

  it('honours an explicit cap', () => {
    expect(playWindow([1, 2, 3, 4], [], 2)).toEqual([1, 2]);
    expect(playWindow([1, 2, 3, 4], [], 0)).toEqual([]);
  });

  it('dedupes repeated ids', () => {
    expect(playWindow([1, 1, 2, 3], [])).toEqual([1, 2, 3]);
  });

  it('does not mutate its inputs', () => {
    const order = [1, 2, 3, 4];
    const deleted = [2];
    playWindow(order, deleted);
    expect(order).toEqual([1, 2, 3, 4]);
    expect(deleted).toEqual([2]);
  });
});
