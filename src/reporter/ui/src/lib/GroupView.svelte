<script lang="ts">
  import FileCard from './FileCard.svelte';
  import { saveAction } from './api.js';
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
  };

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
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });
</script>

<div class="group">
  <div class="group-meta">
    <span class="strategy">{group.strategy}</span>
    <span class="score">{group.similarityScore.toFixed(0)}% similar</span>
  </div>

  <div class="cards">
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
  .cards { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
  .group-actions { display: flex; justify-content: flex-end; gap: 0.75rem; margin-top: 1rem; }
  .skip { padding: 0.5rem 1.25rem; background: transparent; border: 1px solid #555; color: #aaa; border-radius: 4px; cursor: pointer; }
  .keep-all { padding: 0.5rem 1.25rem; background: transparent; border: 1px solid #2a6; color: #2a6; border-radius: 4px; cursor: pointer; }
  .confirm { padding: 0.5rem 1.25rem; background: #2469e1; color: white; border: none; border-radius: 4px; cursor: pointer; }
  .confirm:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
