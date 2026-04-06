<script lang="ts">
  import { mediaUrl } from './api.js';
  import type { MemberWithFile } from '../../../../types.js';

  type Props = {
    member: MemberWithFile;
    decision: 'keep' | 'delete' | 'none';
    onKeep: () => void;
    onDelete: () => void;
    isBest: boolean;
    showBadge: boolean;
  };

  const { member, decision, onKeep, onDelete, isBest, showBadge }: Props = $props();

  const formatSize = (bytes: number) =>
    bytes > 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${(bytes / 1000).toFixed(0)} KB`;

  const formatDuration = (secs?: number) => {
    if (!secs) return null;
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const isVideo = $derived(member.file.mimeType.startsWith('video/'));
  const src = $derived(mediaUrl(member.file.path));
  const badge = $derived(isBest ? 'Best' : member.metadata?.width ? 'Lower res' : 'Smaller');
  const pathParts = $derived(member.file.path.split('/').filter(Boolean));
  const shortPath = $derived(pathParts.slice(-3).join('/'));
</script>

<div class="card" class:keep={decision === 'keep'} class:delete={decision === 'delete'}>
  <div class="preview">
    {#if isVideo}
      <video {src} muted playsinline controls preload="metadata">
        <img {src} alt="thumbnail fallback" />
      </video>
    {:else}
      <img {src} alt={member.file.path} loading="lazy" />
    {/if}
  </div>

  <div class="details">
    {#if showBadge}<span class="badge" class:best={isBest}>{badge}</span>{/if}
    <a href={`file://${member.file.path}`} target="_blank" title={member.file.path} class="path">
      {shortPath}
    </a>
    <ul>
      {#if member.metadata?.width && member.metadata?.height}
        <li>{member.metadata.width}×{member.metadata.height}</li>
      {/if}
      <li>{formatSize(member.file.size)}</li>
      {#if member.metadata?.bitrate}
        <li>{Math.round(member.metadata.bitrate / 1000)} kbps</li>
      {/if}
      {#if member.metadata?.duration}
        <li>{formatDuration(member.metadata.duration)}</li>
      {/if}
    </ul>
  </div>

  <div class="actions">
    <button class="keep-btn" class:active={decision === 'keep'} onclick={onKeep}>Keep</button>
    <button class="del-btn" class:active={decision === 'delete'} onclick={onDelete}>Delete</button>
  </div>
</div>

<style>
  .card { border: 2px solid #333; border-radius: 8px; overflow: hidden; transition: border-color 0.15s; }
  .card.keep { border-color: #2a2; }
  .card.delete { border-color: #e53; opacity: 0.6; }
  .preview { background: #111; aspect-ratio: 4/3; overflow: hidden; display: flex; align-items: center; justify-content: center; }
  .preview img, .preview video { max-width: 100%; max-height: 100%; object-fit: contain; }
  .details { padding: 0.75rem; font-size: 0.8rem; }
  .badge { font-size: 0.7rem; padding: 2px 6px; border-radius: 4px; background: #333; }
  .badge.best { background: #2a6; }
  .path { display: block; margin: 0.4rem 0; color: #88aaff; text-decoration: none; word-break: break-all; }
  ul { list-style: none; display: flex; flex-wrap: wrap; gap: 0.4rem; opacity: 0.7; }
  .actions { display: flex; gap: 0.5rem; padding: 0.5rem 0.75rem; border-top: 1px solid #222; }
  .keep-btn, .del-btn { flex: 1; padding: 0.4rem; border: 1px solid #444; background: transparent; color: #ccc; border-radius: 4px; cursor: pointer; }
  .keep-btn.active { background: #2a6; border-color: #2a6; color: white; }
  .del-btn.active { background: #e53; border-color: #e53; color: white; }
</style>
