/** How many videos may play at once. More than a handful stalls the tab on a network share. */
export const MAX_CONCURRENT_PLAYBACK = 3;

/**
 * Picks which of a group's videos should be playing.
 *
 * Takes the first `max` file ids in display order that the user has not explicitly clicked
 * Delete on. "Explicitly" matters: a non-exact group opens with every copy except the best
 * one pre-marked for deletion, and those defaults are not a viewing choice — honouring them
 * would leave a single video to compare against nothing.
 */
export const playWindow = (
  orderedVideoFileIds: readonly number[],
  explicitlyDeleted: readonly number[],
  max = MAX_CONCURRENT_PLAYBACK,
): number[] => {
  const deleted = new Set(explicitlyDeleted);
  const window: number[] = [];
  for (const fileId of orderedVideoFileIds) {
    if (window.length >= max) break;
    if (deleted.has(fileId) || window.includes(fileId)) continue;
    window.push(fileId);
  }
  return window;
};
