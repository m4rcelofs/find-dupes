<script lang="ts">
  import { onMount } from 'svelte';
  import { fetchGroups, commitDeletes, fetchPendingCount } from './lib/api.js';
  import GroupView from './lib/GroupView.svelte';
  import type { GroupWithMembers } from '../../../types.js';

  let groups = $state<GroupWithMembers[]>([]);
  let currentIndex = $state(0);
  let status = $state('');
  let pendingCount = $state(0);

  const refreshPendingCount = async () => {
    try { pendingCount = await fetchPendingCount(); } catch { /* ignore */ }
  };

  // Skip groups with nothing left to decide: need ≥2 visible (non-deleted) members
  // with at least one still undecided.
  const loadGroups = async () => {
    const all = await fetchGroups();
    return all.filter((g) => {
      const visible = g.members.filter((m) => m.priorDecision !== 'delete');
      return visible.length >= 2 && visible.some((m) => !m.priorDecision);
    });
  };

  onMount(async () => {
    try {
      groups = await loadGroups();
    } catch (e) {
      status = `Failed to load groups: ${e}`;
    }
    await refreshPendingCount();
  });

  const currentGroup = $derived(groups[currentIndex]);
  const remaining = $derived(groups.length - currentIndex);

  // Advance without re-fetching so the list stays stable and Back works.
  // priorDecision badges refresh on commit.
  const onDecided = () => {
    currentIndex += 1;
    refreshPendingCount();
  };

  const onBack = () => { currentIndex = Math.max(0, currentIndex - 1); };

  const onCommit = async () => {
    try {
      const result = await commitDeletes();
      if (result.dryRun) {
        status = `Dry run — would delete: ${result.wouldDelete?.join(', ')}`;
      } else {
        status = `Moved ${result.deleted?.length ?? 0} file(s) to trash.`;
        groups = await loadGroups();
        currentIndex = 0;
      }
      await refreshPendingCount();
    } catch (e) {
      status = `Commit failed: ${e}`;
    }
  };
</script>

<div class="app">
  <header>
    <h1>find-dupes</h1>
    <span>{remaining} group(s) remaining</span>
    <button class="back-btn" onclick={onBack} disabled={currentIndex === 0}>← Back</button>
    <button onclick={onCommit} disabled={pendingCount === 0}>
      Commit Deletes{pendingCount > 0 ? ` (${pendingCount})` : ''}
    </button>
  </header>

  {#if status}
    <div class="status">{status}</div>
  {/if}

  {#if currentGroup}
    {#key currentGroup.id}
      <GroupView group={currentGroup} onDecided={onDecided} />
    {/key}
  {:else if groups.length === 0}
    <p class="empty">No duplicate groups found.</p>
  {:else}
    <p class="empty">All groups reviewed.</p>
  {/if}
</div>

<style>
  .app { max-width: 1400px; margin: 0 auto; padding: 1rem; }
  header { display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem; }
  h1 { font-size: 1.5rem; }
  .back-btn { margin-left: auto; padding: 0.5rem 1rem; background: transparent; border: 1px solid #555; color: #aaa; border-radius: 4px; cursor: pointer; }
  .back-btn:disabled { opacity: 0.3; cursor: not-allowed; }
  button:last-of-type { padding: 0.5rem 1rem; background: #e53; color: white; border: none; border-radius: 4px; cursor: pointer; }
  .status { padding: 0.75rem; background: #1a1a1a; border-radius: 4px; margin-bottom: 1rem; }
  .empty { text-align: center; opacity: 0.5; margin-top: 4rem; }
</style>
