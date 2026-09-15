<script lang="ts">
  import FileCard from './FileCard.svelte';
  import { saveAction } from './api.js';
  import { playWindow, MAX_CONCURRENT_PLAYBACK } from './playback.js';
  import type { GroupWithMembers, Decision } from '../../../../types.js';

  type Props = {
    group: GroupWithMembers;
    onDecided: () => void;
  };

  const { group, onDecided }: Props = $props();

  const isExact = group.strategy === 'exactHash';

  // Hide files already committed for deletion in another group — no value reviewing them again.
  const visibleMembers = group.members.filter((m) => m.priorDecision !== 'delete');

  // When not all members have resolution data, comparing pixel counts against byte counts
  // is meaningless — fall back to file size for everyone so the comparison is consistent.
  const allHaveResolution = visibleMembers.every((m) => m.metadata?.width && m.metadata?.height);
  const score = (m: typeof visibleMembers[0]) => allHaveResolution ? m.qualityScore : m.file.size;

  const bestMemberId = visibleMembers.reduce((best, m) =>
    score(m) > score(visibleMembers.find((x) => x.fileId === best) ?? visibleMembers[0])
      ? m.fileId : best,
    visibleMembers[0]?.fileId ?? 0,
  );

  const bestMember = visibleMembers.find((m) => m.fileId === bestMemberId);

  const getBadgeLabel = (m: typeof visibleMembers[0]): string => {
    if (m.fileId === bestMemberId) return 'Best';
    if (allHaveResolution) return 'Lower res';
    return 'Smaller';
  };

  let decisions = $state<Record<string, Decision>>(
    isExact
      ? Object.fromEntries(visibleMembers.filter((m) => m.priorDecision === 'keep').map((m) => [String(m.fileId), 'keep' as Decision]))
      : Object.fromEntries(visibleMembers.map((m) => [
          String(m.fileId),
          m.priorDecision === 'keep' ? 'keep' : m.fileId === bestMemberId ? 'keep' : 'delete',
        ] as [string, Decision])),
  );

  const setDecision = (fileId: number, d: Decision) => {
    decisions = { ...decisions, [String(fileId)]: d };
    // Only the user's own Delete click retires a video from the play window. The defaults
    // above pre-mark every copy but the best one, which is a recommendation, not a
    // viewing choice — honouring it would leave one video to compare against nothing.
    explicitlyDeleted = d === 'delete'
      ? (explicitlyDeleted.includes(fileId) ? explicitlyDeleted : [...explicitlyDeleted, fileId])
      : explicitlyDeleted.filter((id) => id !== fileId);
  };

  // --- Synced playback -------------------------------------------------------------------
  // Watch the copies in lockstep instead of starting each one by hand. At most
  // MAX_CONCURRENT_PLAYBACK play at once: two groups here have 190 and 339 members.

  /** Seconds of drift tolerated before a video is re-seeked. Also stops sync feedback loops:
   *  syncing converges once every element is within tolerance, so no flag is needed. */
  const SYNC_TOLERANCE = 0.3;

  let playing = $state(false);
  let explicitlyDeleted = $state<number[]>([]);
  let cardsEl = $state<HTMLElement | null>(null);

  const videoOrder = visibleMembers
    .filter((m) => m.file.mimeType.startsWith('video/'))
    .map((m) => m.fileId);

  const activeWindow = $derived(playing ? playWindow(videoOrder, explicitlyDeleted) : []);

  // Queried on demand rather than kept in a registry: the DOM is the authority and cannot
  // go stale. The elements live as long as this group is mounted.
  const videoElements = (): HTMLVideoElement[] =>
    cardsEl ? [...cardsEl.querySelectorAll<HTMLVideoElement>('video[data-file-id]')] : [];

  const videoId = (el: HTMLVideoElement) => Number(el.dataset.fileId);

  const togglePlayAll = () => { playing = !playing; };

  // Drive the elements from activeWindow: start what should play (at the timestamp its
  // neighbours are already at), pause what should not. Writes only to the DOM, never to
  // tracked state, so it cannot re-trigger itself.
  $effect(() => {
    const active = new Set(activeWindow);
    const els = videoElements();
    const reference = els.find((el) => active.has(videoId(el)) && !el.paused);
    const referenceTime = reference ? reference.currentTime : 0;

    for (const el of els) {
      if (!active.has(videoId(el))) {
        if (!el.paused) el.pause();
        continue;
      }
      if (!el.paused) continue;
      if (Math.abs(el.currentTime - referenceTime) > SYNC_TOLERANCE) el.currentTime = referenceTime;
      // Rejects on an undecodable file; one bad copy must not stop the others.
      el.play().catch(() => {});
    }
  });

  // Keep the transport in sync with whatever the native controls do.
  $effect(() => {
    const els = videoElements();
    if (els.length === 0) return;

    const onSeeked = (e: Event) => {
      const el = e.currentTarget as HTMLVideoElement;
      if (!activeWindow.includes(videoId(el))) return;
      const t = el.currentTime;
      for (const other of els) {
        if (other === el || !activeWindow.includes(videoId(other))) continue;
        if (Math.abs(other.currentTime - t) > SYNC_TOLERANCE) other.currentTime = t;
      }
    };

    const onPause = (e: Event) => {
      const el = e.currentTarget as HTMLVideoElement;
      // Ignore a pause we caused by retiring the video, and the one a clip fires when it
      // reaches its end — neither means the user stopped the set.
      if (el.ended || !activeWindow.includes(videoId(el))) return;
      playing = false;
    };

    for (const el of els) {
      el.addEventListener('seeked', onSeeked);
      el.addEventListener('pause', onPause);
    }
    return () => {
      for (const el of els) {
        el.removeEventListener('seeked', onSeeked);
        el.removeEventListener('pause', onPause);
      }
    };
  });

  const hasDecisions = $derived(Object.keys(decisions).length > 0);

  const onSubmit = async () => {
    await saveAction(group.id, decisions);
    onDecided();
  };

  const onSkip = async () => {
    await saveAction(group.id, Object.fromEntries(visibleMembers.map((m) => [String(m.fileId), 'skip' as Decision])));
    onDecided();
  };

  const onKeepAll = async () => {
    await saveAction(group.id, Object.fromEntries(visibleMembers.map((m) => [String(m.fileId), 'keep' as Decision])));
    onDecided();
  };

  // For exact matches: clicking Keep on one file auto-marks the rest as delete and submits immediately.
  const onKeepExact = async (fileId: number) => {
    const autoDecisions = Object.fromEntries(
      visibleMembers.map((m) => [String(m.fileId), (m.fileId === fileId ? 'keep' : 'delete') as Decision]),
    );
    await saveAction(group.id, autoDecisions);
    onDecided();
  };

  // Ignore keystrokes aimed at a control (buttons, the filter checkboxes, …) so focusing
  // one cannot decide the group behind it.
  const isControlTarget = (target: EventTarget | null) =>
    target instanceof HTMLElement
    && target.closest('button, input, select, textarea, [contenteditable="true"]') !== null;

  // Keyboard shortcuts: Enter = confirm, k = keep all, s = skip.
  $effect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return; // ⌘S must save the page, not skip
      if (isControlTarget(e.target)) return;
      if (e.key === 'Enter' && hasDecisions) onSubmit();
      if (e.key === 'k') onKeepAll();
      if (e.key === 's') onSkip();
      if (e.key === 'p' && videoOrder.length >= 2) togglePlayAll();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });
</script>

<div class="group">
  <div class="group-meta">
    <span class="strategy">{group.strategy}</span>
    <span class="score">{group.similarityScore.toFixed(0)}% similar</span>
    {#if videoOrder.length >= 2}
      <button
        class="play-all"
        onclick={togglePlayAll}
        title={`Plays up to ${MAX_CONCURRENT_PLAYBACK} copies at once, in step. Marking one for deletion hands its slot to the next copy.`}
      >
        {playing ? 'Pause All (p)' : 'Play All (p)'}
      </button>
    {/if}
  </div>

  <div class="cards" bind:this={cardsEl}>
    {#each visibleMembers as member (member.fileId)}
      <FileCard
        {member}
        strategy={group.strategy}
        decision={decisions[String(member.fileId)] ?? 'none'}
        isBest={!isExact && member.fileId === bestMemberId}
        badgeLabel={isExact ? '' : getBadgeLabel(member)}
        onKeep={isExact ? () => onKeepExact(member.fileId) : () => setDecision(member.fileId, 'keep')}
        onDelete={() => setDecision(member.fileId, 'delete')}
      />
    {/each}
  </div>

  <div class="group-actions">
    <button class="skip" onclick={onSkip}>Skip (s)</button>
    <button class="keep-all" onclick={onKeepAll}>Keep All (k)</button>
    {#if !isExact}
      <button class="confirm" disabled={!hasDecisions} onclick={onSubmit}>Confirm (Enter)</button>
    {/if}
  </div>
</div>

<style>
  .group { margin-bottom: 2rem; }
  .group-meta { display: flex; gap: 1rem; margin-bottom: 0.75rem; font-size: 0.85rem; opacity: 0.7; }
  .strategy { font-family: monospace; }
  .play-all { margin-left: auto; padding: 0.2rem 0.6rem; background: transparent; border: 1px solid #555; color: #ccc; border-radius: 4px; font-size: 0.8rem; cursor: pointer; }
  .cards { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
  .group-actions { display: flex; justify-content: flex-end; gap: 0.75rem; margin-top: 1rem; }
  .skip { padding: 0.5rem 1.25rem; background: transparent; border: 1px solid #555; color: #aaa; border-radius: 4px; cursor: pointer; }
  .keep-all { padding: 0.5rem 1.25rem; background: transparent; border: 1px solid #2a6; color: #2a6; border-radius: 4px; cursor: pointer; }
  .confirm { padding: 0.5rem 1.25rem; background: #2469e1; color: white; border: none; border-radius: 4px; cursor: pointer; }
  .confirm:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
