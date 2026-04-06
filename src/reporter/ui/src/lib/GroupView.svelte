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

  // For near-duplicates, pre-select the best file as keep and the rest as delete.
  const initialBestId = group.members.reduce((best, m) =>
    m.qualityScore > (group.members.find((x) => x.fileId === best)?.qualityScore ?? 0)
      ? m.fileId : best,
    group.members[0]?.fileId ?? 0,
  );

  let decisions = $state<Record<string, Decision>>(
    isExact
      ? {}
      : Object.fromEntries(group.members.map((m) => [String(m.fileId), m.fileId === initialBestId ? 'keep' : 'delete'])),
  );

  const bestMemberId = $derived(group.members.reduce((best, m) =>
    m.qualityScore > (group.members.find((x) => x.fileId === best)?.qualityScore ?? 0)
      ? m.fileId : best,
    group.members[0]?.fileId ?? 0,
  ));

  const setDecision = (fileId: number, d: Decision) => {
    decisions = { ...decisions, [String(fileId)]: d };
  };

  const hasDecisions = $derived(Object.keys(decisions).length > 0);

  const onSubmit = async () => {
    await saveAction(group.id, decisions);
    onDecided();
  };

  const onSkip = async () => {
    await saveAction(group.id, Object.fromEntries(group.members.map((m) => [String(m.fileId), 'skip' as Decision])));
    onDecided();
  };

  // For exact matches: clicking Keep on one file auto-marks the rest as delete and submits immediately.
  const onKeepExact = async (fileId: number) => {
    const autoDecisions = Object.fromEntries(
      group.members.map((m) => [String(m.fileId), (m.fileId === fileId ? 'keep' : 'delete') as Decision]),
    );
    await saveAction(group.id, autoDecisions);
    onDecided();
  };

  // Enter key confirms when decisions are present.
  $effect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && hasDecisions) onSubmit();
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

  <div class="cards" style="grid-template-columns: repeat({group.members.length}, 1fr)">
    {#each group.members as member (member.fileId)}
      <FileCard
        {member}
        decision={decisions[String(member.fileId)] ?? 'none'}
        isBest={!isExact && member.fileId === bestMemberId}
        showBadge={!isExact}
        onKeep={isExact ? () => onKeepExact(member.fileId) : () => setDecision(member.fileId, 'keep')}
        onDelete={() => setDecision(member.fileId, 'delete')}
      />
    {/each}
  </div>

  <div class="group-actions">
    <button class="skip" onclick={onSkip}>Skip</button>
    {#if !isExact}
      <button class="confirm" disabled={!hasDecisions} onclick={onSubmit}>Confirm (Enter)</button>
    {/if}
  </div>
</div>

<style>
  .group { margin-bottom: 2rem; }
  .group-meta { display: flex; gap: 1rem; margin-bottom: 0.75rem; font-size: 0.85rem; opacity: 0.7; }
  .strategy { font-family: monospace; }
  .cards { display: grid; gap: 1rem; }
  .group-actions { display: flex; justify-content: flex-end; gap: 0.75rem; margin-top: 1rem; }
  .skip { padding: 0.5rem 1.25rem; background: transparent; border: 1px solid #555; color: #aaa; border-radius: 4px; cursor: pointer; }
  .confirm { padding: 0.5rem 1.25rem; background: #2469e1; color: white; border: none; border-radius: 4px; cursor: pointer; }
  .confirm:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
