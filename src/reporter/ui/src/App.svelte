<script lang="ts">
  import { onMount } from 'svelte';
  import { fetchGroups, commitDeletes, fetchPendingCount, type CommitResult } from './lib/api.js';
  import { formatCommitProgress } from './lib/progress.js';
  import GroupView from './lib/GroupView.svelte';
  import type { GroupWithMembers } from '../../../types.js';

  let groups = $state<GroupWithMembers[]>([]);
  let status = $state('');
  let pendingCount = $state(0);
  // True on first paint: without it the empty-list branch renders "No duplicate groups
  // found." for the several seconds /api/groups takes on a network volume.
  let loading = $state(true);
  // Tells "all reviewed" apart from "none found" — both leave the list empty.
  let decidedAny = $state(false);
  let committing = $state(false);
  // Pending count snapshotted when Commit was clicked, so progress has a denominator.
  let commitTotal = $state(0);

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
    } finally {
      loading = false;
    }
    await refreshPendingCount();
  });

  // Every decided group gains a report_actions row and is excluded server-side, so the list
  // shrinks and the next group is always the head — there is no cursor to advance.
  const currentGroup = $derived(groups[0]);
  const remaining = $derived(groups.length);
  const commitProgress = $derived(formatCommitProgress({ total: commitTotal, pending: pendingCount }));

  const onDecided = async () => {
    decidedAny = true; // the decision is already saved server-side, however the reload goes
    loading = true;
    try {
      groups = await loadGroups();
    } catch (e) {
      status = `Failed to reload groups: ${e}`;
    } finally {
      loading = false;
    }
    refreshPendingCount();
  };

  /** Polls the pending count once a second; returns a stop function. */
  const startPendingPoll = () => {
    let inFlight = false;
    const timer = setInterval(async () => {
      if (inFlight) return; // a slow poll must not queue up behind itself
      inFlight = true;
      try { pendingCount = await fetchPendingCount(); }
      catch { /* transient — keep the last known count */ }
      finally { inFlight = false; }
    }, 1000);
    return () => clearInterval(timer);
  };

  const onCommit = async () => {
    if (committing) return; // the disabled attribute alone races a double click
    commitTotal = pendingCount;
    committing = true;
    status = '';
    // The commit marks each file deleted as it goes, so the pending count drops in real
    // time and doubles as a progress signal.
    const stopPolling = startPendingPoll();

    let result: CommitResult | undefined;
    try {
      result = await commitDeletes();
    } catch (e) {
      status = `Commit failed: ${e}`;
    } finally {
      // Scoped to the commit itself, not the regroup below: otherwise the progress line
      // would hide the summary for the several seconds the regroup takes.
      stopPolling();
      committing = false;
    }

    if (!result) {
      await refreshPendingCount();
      return;
    }

    if (result.dryRun) {
      status = `Dry run — would delete: ${result.wouldDelete?.join(', ')}`;
    } else {
      const fallbackCount = result.fallback?.length ?? 0;
      const parts = [`Moved ${result.deleted?.length ?? 0} file(s) to trash.`];
      if (fallbackCount > 0) {
        // Network volumes have no system trash, so those files went to a dir on the volume.
        parts.push(`${fallbackCount} went to ${result.fallbackDir}/ (volume has no trash).`);
      }
      // Errors used to be dropped silently, which made a total failure look like a no-op.
      for (const err of result.errors ?? []) parts.push(`Failed: ${err.path} — ${err.error}`);
      status = parts.join(' ');

      loading = true;
      try { groups = await loadGroups(); }
      catch (e) { status = `${status} Failed to reload groups: ${e}`; }
      finally { loading = false; }
    }
    await refreshPendingCount();
  };
</script>

<div class="app">
  <header>
    <h1>find-dupes</h1>
    <span>{remaining} group(s) remaining</span>
    <button onclick={onCommit} disabled={committing || pendingCount === 0}>
      {#if committing}
        Moving…
      {:else}
        Commit Deletes{pendingCount > 0 ? ` (${pendingCount})` : ''}
      {/if}
    </button>
  </header>

  {#if committing || status}
    <div class="status">{committing ? commitProgress : status}</div>
  {/if}

  {#if loading}
    <p class="loading"><span class="spinner"></span> Loading duplicate groups…</p>
  {:else if currentGroup}
    {#key currentGroup.id}
      <GroupView group={currentGroup} onDecided={onDecided} />
    {/key}
  {:else}
    <p class="empty">{decidedAny ? 'All groups reviewed.' : 'No duplicate groups found.'}</p>
  {/if}
</div>

<style>
  .app { max-width: 1400px; margin: 0 auto; padding: 1rem; }
  header { display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem; }
  h1 { font-size: 1.5rem; }
  button { margin-left: auto; padding: 0.5rem 1rem; background: #e53; color: white; border: none; border-radius: 4px; cursor: pointer; }
  button:disabled { opacity: 0.4; cursor: not-allowed; }
  .status { padding: 0.75rem; background: #1a1a1a; border-radius: 4px; margin-bottom: 1rem; }
  .empty { text-align: center; opacity: 0.5; margin-top: 4rem; }
  .loading { display: flex; align-items: center; justify-content: center; gap: 0.6rem; margin-top: 4rem; color: #888; }
  /* Svelte hashes keyframe names per component, so these must stay in this file. */
  .spinner { width: 16px; height: 16px; border: 2px solid #333; border-top-color: #88aaff; border-radius: 50%; animation: spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
