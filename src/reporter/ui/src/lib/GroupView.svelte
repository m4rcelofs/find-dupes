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

  // Best visible file by quality score, used to pre-select keep in near-dup groups.
  const initialBestId = visibleMembers.reduce((best, m) =>
    m.qualityScore > (visibleMembers.find((x) => x.fileId === best)?.qualityScore ?? 0)
      ? m.fileId : best,
    visibleMembers[0]?.fileId ?? 0,
  );

  let decisions = $state<Record<string, Decision>>(
    isExact
      ? Object.fromEntries(visibleMembers.filter((m) => m.priorDecision === 'keep').map((m) => [String(m.fileId), 'keep' as Decision]))
      : Object.fromEntries(visibleMembers.map((m) => [
          String(m.fileId),
          m.priorDecision === 'keep' ? 'keep' : m.fileId === initialBestId ? 'keep' : 'delete',
        ] as [string, Decision])),
  );

  const bestMemberId = visibleMembers.reduce((best, m) =>
    m.qualityScore > (visibleMembers.find((x) => x.fileId === best)?.qualityScore ?? 0)
      ? m.fileId : best,
    visibleMembers[0]?.fileId ?? 0,
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

  // Keyboard shortcuts: Enter = confirm, k = keep all.
  $effect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLButtonElement) return;
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
        showBadge={!isExact}
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
